// Pure image → mesh pipeline (runs in the image worker). No DOM.
import type { CrossSection as CrossSectionT } from 'manifold-3d';
import { wasm, keep } from '../../geometry/kernelCore';
import type { ImageSettings, ProcessResult, RasterRGBA } from './types';

/** 0..255 "ink": darkness × alpha (transparent and white are both empty). */
export function inkOf(r: RasterRGBA): Float32Array {
  const ink = new Float32Array(r.w * r.h);
  const p = r.rgba;
  for (let i = 0; i < ink.length; i++) {
    const lum = 0.2126 * p[i * 4]! + 0.7152 * p[i * 4 + 1]! + 0.0722 * p[i * 4 + 2]!;
    ink[i] = ((255 - lum) * p[i * 4 + 3]!) / 255;
  }
  return ink;
}

/** Separable box blur, applied twice (close to a Gaussian). Radius in pixels. */
export function blur(src: Float32Array, w: number, h: number, radius: number): Float32Array {
  const r = Math.round(radius);
  if (r < 1) return src;
  let a = src.slice();
  const b = new Float32Array(a.length);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) {
      let sum = 0;
      for (let x = -r; x <= r; x++) sum += a[y * w + Math.min(w - 1, Math.max(0, x))]!;
      for (let x = 0; x < w; x++) {
        b[y * w + x] = sum / (2 * r + 1);
        sum += a[y * w + Math.min(w - 1, x + r + 1)]! - a[y * w + Math.max(0, x - r)]!;
      }
    }
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let y = -r; y <= r; y++) sum += b[Math.min(h - 1, Math.max(0, y)) * w + x]!;
      for (let y = 0; y < h; y++) {
        a[y * w + x] = sum / (2 * r + 1);
        sum += b[Math.min(h - 1, y + r + 1) * w + x]! - b[Math.max(0, y - r) * w + x]!;
      }
    }
  }
  return a;
}

/** Ramer–Douglas–Peucker on a closed loop. */
function simplify(loop: Array<[number, number]>, eps: number): Array<[number, number]> {
  if (loop.length < 8) return loop;
  const keepPt = new Uint8Array(loop.length);
  const rdp = (a: number, b: number) => {
    const [ax, ay] = loop[a]!, [bx, by] = loop[b]!;
    const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1;
    let best = -1, bestD = eps;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * (loop[i]![0] - ax) - dx * (loop[i]![1] - ay)) / l;
      if (d > bestD) { bestD = d; best = i; }
    }
    if (best > 0) { keepPt[best] = 1; rdp(a, best); rdp(best, b); }
  };
  const mid = Math.floor(loop.length / 2);
  keepPt[0] = keepPt[mid] = keepPt[loop.length - 1] = 1;
  rdp(0, mid);
  rdp(mid, loop.length - 1);
  return loop.filter((_, i) => keepPt[i]);
}

/**
 * Marching squares with sub-pixel interpolation on a value grid (selected
 * where value ≥ threshold) → closed outlines in pixel coordinates (y down).
 */
export function trace(values: Float32Array, w: number, h: number, threshold: number, eps: number): Array<Array<[number, number]>> {
  const W = w + 2, H = h + 2; // empty border so every loop closes
  const val = new Float32Array(W * H);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) val[(y + 1) * W + x + 1] = values[y * w + x]!;
  const solid = (i: number) => (val[i]! >= threshold ? 1 : 0);
  const stride = 2 * W + 1;
  const key = (x2: number, y2: number) => y2 * stride + x2;
  const next = new Map<number, number[]>();
  const add = (a: number, b: number) => {
    const l = next.get(a) ?? [];
    l.push(b);
    next.set(a, l);
  };
  for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
    const c = solid(y * W + x) * 8 + solid(y * W + x + 1) * 4 + solid((y + 1) * W + x + 1) * 2 + solid((y + 1) * W + x);
    if (c === 0 || c === 15) continue;
    const T = key(2 * x + 1, 2 * y), R = key(2 * x + 2, 2 * y + 1), B = key(2 * x + 1, 2 * y + 2), L = key(2 * x, 2 * y + 1);
    switch (c) {
      case 1: add(L, B); break;
      case 2: add(B, R); break;
      case 3: add(L, R); break;
      case 4: add(R, T); break;
      case 5: add(L, T); add(R, B); break;
      case 6: add(B, T); break;
      case 7: add(L, T); break;
      case 8: add(T, L); break;
      case 9: add(T, B); break;
      case 10: add(T, R); add(B, L); break;
      case 11: add(T, R); break;
      case 12: add(R, L); break;
      case 13: add(R, B); break;
      case 14: add(B, L); break;
    }
  }
  const point = (k: number): [number, number] => {
    const x2 = k % stride, y2 = Math.floor(k / stride);
    let ax: number, ay: number, bx: number, by: number;
    if (x2 % 2 === 1) { ax = (x2 - 1) / 2; ay = y2 / 2; bx = ax + 1; by = ay; }
    else { ax = x2 / 2; ay = (y2 - 1) / 2; bx = ax; by = ay + 1; }
    const va = val[ay * W + ax]!, vb = val[by * W + bx]!;
    const t = va === vb ? 0.5 : Math.min(1, Math.max(0, (threshold - va) / (vb - va)));
    return [ax + (bx - ax) * t - 0.5, ay + (by - ay) * t - 0.5];
  };
  const loops: Array<Array<[number, number]>> = [];
  while (next.size) {
    const start = next.keys().next().value as number;
    const loop: Array<[number, number]> = [];
    let cur = start;
    for (let guard = 0; guard < 8e6; guard++) {
      loop.push(point(cur));
      const outs = next.get(cur);
      if (!outs?.length) break;
      const n = outs.pop()!;
      if (!outs.length) next.delete(cur);
      cur = n;
      if (cur === start) break;
    }
    if (loop.length >= 3) loops.push(simplify(loop, eps));
  }
  return loops;
}

/**
 * Dominant colours: a 4-bit-per-channel histogram of the opaque pixels, the
 * ≤ k most frequent buckets (each at least 0.5 % of the image), averaged.
 * Flat logo colours come back exactly; photos get their main tones.
 */
export function quantize(r: RasterRGBA, k = 8): string[] {
  const count = new Map<number, { n: number; r: number; g: number; b: number }>();
  let opaque = 0;
  for (let i = 0; i < r.w * r.h; i++) {
    if (r.rgba[i * 4 + 3]! < 128) continue;
    opaque++;
    const R = r.rgba[i * 4]!, G = r.rgba[i * 4 + 1]!, B = r.rgba[i * 4 + 2]!;
    const key = ((R >> 4) << 8) | ((G >> 4) << 4) | (B >> 4);
    const e = count.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += R; e.g += G; e.b += B;
    count.set(key, e);
  }
  const hex = (v: number) => Math.round(v).toString(16).padStart(2, '0');
  return [...count.values()]
    .filter((e) => e.n >= opaque * 0.005)
    .sort((a, b) => b.n - a.n)
    .slice(0, k)
    .map((e) => `#${hex(e.r / e.n)}${hex(e.g / e.n)}${hex(e.b / e.n)}`);
}

/** Nearest palette entry (1-based) for an image pixel; 0 when transparent or no palette. */
function sampler(r: RasterRGBA, colors: string[], selected?: (i: number) => boolean) {
  const pal = colors.map((c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]);
  return (fx: number, fy: number) => {
    if (!pal.length) return 0;
    const x = Math.min(r.w - 1, Math.max(0, Math.round(fx))), y = Math.min(r.h - 1, Math.max(0, Math.round(fy)));
    if (selected && !selected(y * r.w + x)) return 0; // background under an edge triangle: base colour
    const i = (y * r.w + x) * 4;
    if (r.rgba[i + 3]! < 64) return 0;
    let best = 0, bd = Infinity;
    pal.forEach((c, j) => {
      const d = (c[0]! - r.rgba[i]!) ** 2 + (c[1]! - r.rgba[i + 1]!) ** 2 + (c[2]! - r.rgba[i + 2]!) ** 2;
      if (d < bd) { bd = d; best = j + 1; }
    });
    return best;
  };
}

/** Smoothing scaled to the raster so preview and full resolution look the same. */
const pxScale = (r: RasterRGBA) => Math.max(r.w, r.h) / 400;

export interface Processed {
  values: Float32Array;
  selected: number;
}

/** Ink → blurred, optionally inverted values (0..255). */
export function values(r: RasterRGBA, s: ImageSettings): Processed {
  let v = blur(inkOf(r), r.w, r.h, s.smooth * 1.2 * pxScale(r));
  if (s.invert) {
    v = v.slice();
    for (let i = 0; i < v.length; i++) v[i] = 255 - v[i]!;
  }
  let selected = 0;
  if (s.method === 'contour') for (const x of v) { if (x >= s.threshold) selected++; }
  else for (const x of v) { if (x > 1) selected++; }
  return { values: v, selected };
}

export async function contourMesh(r: RasterRGBA, s: ImageSettings, p: Processed, colors: string[]): Promise<Omit<ProcessResult, 'mask' | 'maskW' | 'maskH' | 'selected'>> {
  const { CrossSection, Manifold } = await wasm();
  const eps = (0.25 + s.smooth * 0.18) * pxScale(r);
  const loops = trace(p.values, r.w, r.h, s.threshold, eps);
  const points = loops.reduce((n, l) => n + l.length, 0);
  const scale = s.width / r.w;
  if (!loops.length) return { points: 0, positions: new Float32Array(0), triColor: new Uint8Array(0), colors, size: [0, 0, 0] };
  let cs: CrossSectionT = new CrossSection(loops.map((l) => l.map(([x, y]) => [x * scale, -y * scale] as [number, number])), 'EvenOdd');
  // drop specks smaller than ~4 preview pixels
  const minArea = 4 * (pxScale(r) * scale) ** 2;
  const parts = cs.decompose().filter((q) => (q.area() >= minArea ? true : (q.delete(), false)));
  cs.delete();
  cs = CrossSection.union(parts);
  parts.forEach((q) => q.delete());
  if (cs.isEmpty()) {
    cs.delete();
    return { points, positions: new Float32Array(0), triColor: new Uint8Array(0), colors, size: [0, 0, 0] };
  }
  const b = cs.bounds();
  const cx = (b.min[0] + b.max[0]) / 2, cy = (b.min[1] + b.max[1]) / 2;
  const centred = cs.translate([-cx, -cy]);
  cs.delete();
  let solid = keep(Manifold.extrude(centred, s.depth));
  centred.delete();
  const textured = s.textures && colors.length > 0;
  if (textured) solid = keep(solid.refineToLength(Math.max(s.width / 140, 0.2)));
  const g = solid.getMesh();
  const tris = g.numTri;
  const positions = new Float32Array(tris * 9);
  const triColor = new Uint8Array(tris);
  const sample = sampler(r, colors, (i) => p.values[i]! >= s.threshold);
  for (let t = 0; t < tris; t++) {
    let top = true, sx = 0, sy = 0;
    for (let k = 0; k < 3; k++) {
      const v = g.triVerts[t * 3 + k]!;
      const x = g.vertProperties[v * g.numProp]!, y = g.vertProperties[v * g.numProp + 1]!, z = g.vertProperties[v * g.numProp + 2]!;
      positions[t * 9 + k * 3] = x; positions[t * 9 + k * 3 + 1] = y; positions[t * 9 + k * 3 + 2] = z;
      if (Math.abs(z - s.depth) > 1e-4) top = false;
      sx += x; sy += y;
    }
    if (textured && top) triColor[t] = sample((sx / 3 + cx) / scale, -(sy / 3 + cy) / scale);
  }
  return { points, positions, triColor, colors, size: [b.max[0] - b.min[0], b.max[1] - b.min[1], s.depth] };
}

/** Watertight heightmap plate: top follows ink (scaled by Levels), flat bottom, walls. */
export function reliefMesh(r: RasterRGBA, s: ImageSettings, p: Processed, colors: string[], samples: number): Omit<ProcessResult, 'mask' | 'maskW' | 'maskH' | 'selected'> {
  const k = Math.min(1, samples / Math.max(r.w, r.h));
  const w = Math.max(2, Math.round(r.w * k)), h = Math.max(2, Math.round(r.h * k));
  const cell = s.width / (w - 1);
  const white = Math.max(1, s.threshold);
  const hAt = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = Math.min(r.w - 1, Math.round((x / (w - 1)) * (r.w - 1)));
    const sy = Math.min(r.h - 1, Math.round((y / (h - 1)) * (r.h - 1)));
    hAt[y * w + x] = s.base + Math.min(1, p.values[sy * r.w + sx]! / white) * s.depth;
  }
  const X = (x: number) => (x - (w - 1) / 2) * cell;
  const Y = (y: number) => ((h - 1) / 2 - y) * cell;
  const tris = (w - 1) * (h - 1) * 4 + ((w - 1) * 2 + (h - 1) * 2) * 2;
  const positions = new Float32Array(tris * 9);
  const triColor = new Uint8Array(tris);
  const sample = sampler(r, s.textures ? colors : []);
  let t = 0;
  const put = (a: number[], b: number[], c: number[], col = 0) => {
    positions.set(a, t * 9); positions.set(b, t * 9 + 3); positions.set(c, t * 9 + 6);
    triColor[t++] = col;
  };
  const top = (x: number, y: number) => [X(x), Y(y), hAt[y * w + x]!];
  const bot = (x: number, y: number) => [X(x), Y(y), 0];
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
    const col = sample(((x + 0.5) / (w - 1)) * (r.w - 1), ((y + 0.5) / (h - 1)) * (r.h - 1));
    put(top(x, y), top(x, y + 1), top(x + 1, y + 1), col); put(top(x, y), top(x + 1, y + 1), top(x + 1, y), col);
    put(bot(x, y), bot(x + 1, y + 1), bot(x, y + 1)); put(bot(x, y), bot(x + 1, y), bot(x + 1, y + 1));
  }
  const wall = (a: [number, number], b: [number, number]) => {
    put(bot(...a), bot(...b), top(...b)); put(bot(...a), top(...b), top(...a));
  };
  for (let x = 0; x < w - 1; x++) { wall([x + 1, 0], [x, 0]); wall([x, h - 1], [x + 1, h - 1]); }
  for (let y = 0; y < h - 1; y++) { wall([0, y], [0, y + 1]); wall([w - 1, y + 1], [w - 1, y]); }
  let maxH = 0;
  for (const v of hAt) maxH = Math.max(maxH, v);
  return { points: 0, positions, triColor, colors, size: [s.width, cell * (h - 1), maxH] };
}
