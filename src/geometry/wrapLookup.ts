// Shared (main thread + kernel worker) maths for putting a flat text/SVG/picture
// shape onto a surface. Pure: no three.js, no Wasm.

export type V3 = [number, number, number];

export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const unit = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** Tangent frame at the click: z = normal, y = "up" projected, x = y × z; turned by `rotation` degrees. */
export function surfaceFrame(n0: V3, up0: V3, rotation: number): [V3, V3, V3] {
  const n = unit(n0);
  let up = up0;
  if (Math.abs(dot(unit(up), n)) > 0.95) up = Math.abs(n[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0];
  const y0 = unit([up[0] - n[0] * dot(up, n), up[1] - n[1] * dot(up, n), up[2] - n[2] * dot(up, n)]);
  const x0 = cross(y0, n);
  const r = (rotation * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  const x: V3 = [x0[0] * c + y0[0] * s, x0[1] * c + y0[1] * s, x0[2] * c + y0[2] * s];
  const y: V3 = [-x0[0] * s + y0[0] * c, -x0[1] * s + y0[1] * c, -x0[2] * s + y0[2] * c];
  return [x, y, n];
}

/**
 * Surface sampled on a regular (x, y) grid of the flat shape: `S` is the surface point,
 * `N` the outward normal there. Shape point (x, y, z) lands at S(x, y) + z·N(x, y).
 */
export interface WrapTable {
  x0: number; dx: number; nx: number;
  y0: number; dy: number; ny: number;
  S: Float32Array;
  N: Float32Array;
}

/** Bilinear lookup; writes the world position of shape point (x, y, z) into `out`. */
export function wrapPoint(t: WrapTable, x: number, y: number, z: number, out: V3 | number[]): void {
  const fx = Math.max(0, Math.min(t.nx - 1.000001, (x - t.x0) / t.dx));
  const fy = Math.max(0, Math.min(t.ny - 1.000001, (y - t.y0) / t.dy));
  const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
  // linear extrapolation beyond the table edges keeps the shape's size
  const ex = x < t.x0 ? x - t.x0 : x > t.x0 + t.dx * (t.nx - 1) ? x - (t.x0 + t.dx * (t.nx - 1)) : 0;
  const ey = y < t.y0 ? y - t.y0 : y > t.y0 + t.dy * (t.ny - 1) ? y - (t.y0 + t.dy * (t.ny - 1)) : 0;
  const a = (j * t.nx + i) * 3, b = a + 3, c = a + t.nx * 3, d = c + 3;
  const w00 = (1 - u) * (1 - v), w10 = u * (1 - v), w01 = (1 - u) * v, w11 = u * v;
  let nx = 0, ny = 0, nz = 0;
  for (let k = 0; k < 3; k++) {
    out[k] = t.S[a + k]! * w00 + t.S[b + k]! * w10 + t.S[c + k]! * w01 + t.S[d + k]! * w11;
    const n = t.N[a + k]! * w00 + t.N[b + k]! * w10 + t.N[c + k]! * w01 + t.N[d + k]! * w11;
    if (k === 0) nx = n; else if (k === 1) ny = n; else nz = n;
  }
  const l = Math.hypot(nx, ny, nz) || 1;
  nx /= l; ny /= l; nz /= l;
  if (ex || ey) {
    // tangent directions at the nearest edge cell
    const sx = i + 1 < t.nx ? a + 3 : a, sy = j + 1 < t.ny ? a + t.nx * 3 : a;
    for (let k = 0; k < 3; k++) {
      const tx = (t.S[sx + k]! - t.S[a + k]!) / t.dx, ty = (t.S[sy + k]! - t.S[a + k]!) / t.dy;
      out[k] = out[k]! + tx * ex + ty * ey;
    }
  }
  out[0] = out[0]! + nx * z;
  out[1] = out[1]! + ny * z;
  out[2] = out[2]! + nz * z;
}
