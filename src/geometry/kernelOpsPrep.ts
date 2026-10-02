// Kernel operations for model prep and repair (post-phase gap features).
import type { Manifold as ManifoldT, Vec3 } from 'manifold-3d';
import { KernelError, fromManifold, keep, registerOp, toManifold, wasm } from './kernelCore';
import { dominantColor, expand, weld } from './meshOps';
import type { KernelMesh } from './protocol';
import { quadricEdgeCollapse } from '../ported/simplify/quadricEdgeCollapse';
import { autoOrient } from '../ported/orient/autoOrient';

// ---------------------------------------------------------------- shells

/** Connected pieces of a soup (triangles sharing a welded vertex), as triangle index lists. */
export function shells(positions: Float32Array): Uint32Array[] {
  const tris = positions.length / 9;
  const { index, count } = weld(positions, 1e-5);
  const parent = new Int32Array(count);
  for (let i = 0; i < count; i++) parent[i] = i;
  const find = (x: number) => {
    while (parent[x] !== x) { parent[x] = parent[parent[x]!]!; x = parent[x]!; }
    return x;
  };
  for (let t = 0; t < tris; t++) {
    const a = find(index[t * 3]!), b = find(index[t * 3 + 1]!);
    if (a !== b) parent[b] = a;
    const r = find(a), c = find(index[t * 3 + 2]!);
    if (r !== c) parent[c] = r;
  }
  const groups = new Map<number, number[]>();
  for (let t = 0; t < tris; t++) {
    const r = find(index[t * 3]!);
    let g = groups.get(r);
    if (!g) groups.set(r, (g = []));
    g.push(t);
  }
  return [...groups.values()].map((g) => Uint32Array.from(g));
}

function subset(mesh: KernelMesh, tris: ArrayLike<number>): KernelMesh {
  const positions = new Float32Array(tris.length * 9);
  const faceColors = new Uint16Array(tris.length);
  for (let i = 0; i < tris.length; i++) {
    const t = tris[i]!;
    positions.set(mesh.positions.subarray(t * 9, t * 9 + 9), i * 9);
    faceColors[i] = mesh.faceColors[t]!;
  }
  return { positions, faceColors };
}

function concat(meshes: KernelMesh[]): KernelMesh {
  let n = 0;
  for (const m of meshes) n += m.faceColors.length;
  const positions = new Float32Array(n * 9), faceColors = new Uint16Array(n);
  let k = 0;
  for (const m of meshes) {
    positions.set(m.positions, k * 9);
    faceColors.set(m.faceColors, k);
    k += m.faceColors.length;
  }
  return { positions, faceColors };
}

function signedVolume(p: Float32Array): number {
  let v = 0;
  for (let o = 0; o < p.length; o += 9) {
    v += (p[o]! * (p[o + 4]! * p[o + 8]! - p[o + 5]! * p[o + 7]!) - p[o + 1]! * (p[o + 3]! * p[o + 8]! - p[o + 5]! * p[o + 6]!) + p[o + 2]! * (p[o + 3]! * p[o + 7]! - p[o + 4]! * p[o + 6]!)) / 6;
  }
  return v;
}

function bbox(p: Float32Array) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) for (let a = 0; a < 3; a++) {
    const v = p[i + a]!;
    if (v < min[a]!) min[a] = v;
    if (v > max[a]!) max[a] = v;
  }
  return { min, max };
}

/** Ray parity test along a slightly skewed +X ray (avoids hitting edges exactly). */
function insideSoup(p: Float32Array, x: number, y: number, z: number): boolean {
  const dx = 1, dy = 1.3e-4, dz = 2.1e-4;
  let hits = 0;
  for (let o = 0; o < p.length; o += 9) {
    // Möller–Trumbore
    const e1x = p[o + 3]! - p[o]!, e1y = p[o + 4]! - p[o + 1]!, e1z = p[o + 5]! - p[o + 2]!;
    const e2x = p[o + 6]! - p[o]!, e2y = p[o + 7]! - p[o + 1]!, e2z = p[o + 8]! - p[o + 2]!;
    const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-12) continue;
    const inv = 1 / det;
    const tx = x - p[o]!, ty = y - p[o + 1]!, tz = z - p[o + 2]!;
    const u = (tx * px + ty * py + tz * pz) * inv;
    if (u < 0 || u > 1) continue;
    const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * inv;
    if (v < 0 || u + v > 1) continue;
    if ((e2x * qx + e2y * qy + e2z * qz) * inv > 0) hits++;
  }
  return hits % 2 === 1;
}

interface Shell { mesh: KernelMesh; volume: number; box: ReturnType<typeof bbox> }

/** Shells grouped into printable parts: inner cavity shells (negative volume) stay with the shell around them. */
function parts(mesh: KernelMesh): KernelMesh[] {
  const list: Shell[] = shells(mesh.positions).map((t) => {
    const m = subset(mesh, t);
    return { mesh: m, volume: signedVolume(m.positions), box: bbox(m.positions) };
  });
  const outer = list.filter((s) => s.volume >= 0);
  if (!outer.length) return [mesh];
  const groups = new Map<Shell, KernelMesh[]>(outer.map((s) => [s, [s.mesh]]));
  for (const s of list) {
    if (s.volume >= 0) continue;
    const p = s.mesh.positions;
    let host: Shell | null = null;
    for (const o of outer) {
      const contains = [0, 1, 2].every((a) => o.box.min[a]! <= s.box.min[a]! + 1e-6 && o.box.max[a]! >= s.box.max[a]! - 1e-6);
      if (!contains || !insideSoup(o.mesh.positions, p[0]!, p[1]!, p[2]!)) continue;
      if (!host || o.volume < host.volume) host = o;
    }
    if (host) groups.get(host)!.push(s.mesh);
    else groups.set(s, [s.mesh]); // a stray inward shell stays its own part
  }
  return [...groups.values()].map(concat);
}

registerOp('splitParts', (async (a: { mesh: KernelMesh }) => {
  const out = parts(a.mesh);
  return { parts: out.sort((x, y) => y.faceColors.length - x.faceColors.length) };
}) as never);

// ---------------------------------------------------------------- simplify (QEM port)

registerOp('simplify', (async (a: { mesh: KernelMesh; ratio: number; maxError?: number }) => {
  const { index, verts } = weld(a.mesh.positions, 1e-5);
  const tris = a.mesh.faceColors.length;
  const target = Math.max(4, Math.floor(tris * Math.min(1, Math.max(0, a.ratio))));
  const r = quadricEdgeCollapse({ vertices: verts, indices: index }, target, a.maxError ?? Infinity);
  const ids = new Uint32Array(r.sourceTriangle.length);
  for (let i = 0; i < ids.length; i++) ids[i] = a.mesh.faceColors[r.sourceTriangle[i]!]!;
  return { mesh: expand(r.vertices, 3, r.indices, ids, (id) => id), before: tris, after: r.sourceTriangle.length };
}) as never);

// ---------------------------------------------------------------- smooth

registerOp('smooth', (async (a: { mesh: KernelMesh; sharpAngle: number; subdivisions: number; paletteSize: number }) => {
  const m = await toManifold(a.mesh);
  let out: ManifoldT = keep(m.smoothOut(a.sharpAngle, 0));
  out = keep(out.refine(Math.max(1, Math.min(6, Math.round(a.subdivisions)))));
  const fallback = dominantColor(a.mesh.faceColors);
  return { mesh: fromManifold(out, (id) => (id < a.paletteSize ? id : fallback)) };
}) as never);

// ---------------------------------------------------------------- auto orient (Orient.cpp port)

registerOp('orient', (async (a: { mesh: KernelMesh; overhangAngle: number }) => {
  const { Manifold } = await wasm();
  const { verts, count } = weld(a.mesh.positions, 1e-4);
  const step = Math.max(1, Math.floor(count / 200_000));
  const pts: Vec3[] = [];
  for (let i = 0; i < count; i += step) pts.push([verts[i * 3]!, verts[i * 3 + 1]!, verts[i * 3 + 2]!]);
  const hull = keep(Manifold.hull(pts));
  const hullSoup = fromManifold(hull, () => 0).positions;
  const { best, ranked } = autoOrient(a.mesh.positions, hullSoup, a.overhangAngle);
  const current = ranked.find((r) => r.up[2] > 1 - 1e-6) ?? null;
  return { up: best.up, overhang: best.overhang, bottom: best.bottom, currentOverhang: current?.overhang ?? null };
}) as never);

// ---------------------------------------------------------------- extrude down (3D Builder behaviour, reimplemented)

registerOp('extrudeDown', (async (a: { mesh: KernelMesh; paletteSize: number; floor?: number }) => {
  const { Manifold, Mesh } = await wasm();
  const obj = await toManifold(a.mesh);
  const { index, verts, count } = weld(a.mesh.positions, 1e-5);
  const tris = a.mesh.faceColors.length;
  let minZ = Infinity;
  for (let i = 0; i < count; i++) minZ = Math.min(minZ, verts[i * 3 + 2]!);
  const floor = Math.min(a.floor ?? 0, minZ);
  const down: number[] = [];
  for (let t = 0; t < tris; t++) {
    const A = index[t * 3]! * 3, B = index[t * 3 + 1]! * 3, C = index[t * 3 + 2]! * 3;
    const ux = verts[B]! - verts[A]!, uy = verts[B + 1]! - verts[A + 1]!, uz = verts[B + 2]! - verts[A + 2]!;
    const vx = verts[C]! - verts[A]!, vy = verts[C + 1]! - verts[A + 1]!, vz = verts[C + 2]! - verts[A + 2]!;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    if (!l || nz / l > -0.02) continue;
    const top = Math.max(verts[A + 2]!, verts[B + 2]!, verts[C + 2]!);
    if (top - floor < 0.01) continue; // already on the floor
    down.push(t);
  }
  if (!down.length) throw new KernelError('Nothing to extrude: the object has no downward-facing surface above the grid.');
  // group downward faces into patches sharing an edge
  const ekey = (p: number, q: number) => (p < q ? p * count + q : q * count + p);
  const edgeTris = new Map<number, number[]>();
  for (const t of down) for (let k = 0; k < 3; k++) {
    const key = ekey(index[t * 3 + k]!, index[t * 3 + ((k + 1) % 3)]!);
    const l = edgeTris.get(key);
    if (l) l.push(t); else edgeTris.set(key, [t]);
  }
  const seen = new Set<number>();
  const patches: number[][] = [];
  for (const t0 of down) {
    if (seen.has(t0)) continue;
    const patch: number[] = [];
    const stack = [t0];
    seen.add(t0);
    while (stack.length) {
      const t = stack.pop()!;
      patch.push(t);
      for (let k = 0; k < 3; k++) {
        const l = edgeTris.get(ekey(index[t * 3 + k]!, index[t * 3 + ((k + 1) % 3)]!))!;
        if (l.length !== 2) continue;
        for (const u of l) if (!seen.has(u)) { seen.add(u); stack.push(u); }
      }
    }
    patches.push(patch);
  }
  const LIFT = 0.01;
  const solids: ManifoldT[] = [];
  const prism = (tri: number[], color: number) => {
    const pts: Vec3[] = [];
    for (const v of tri) pts.push([verts[v * 3]!, verts[v * 3 + 1]!, verts[v * 3 + 2]! + LIFT], [verts[v * 3]!, verts[v * 3 + 1]!, floor]);
    const h = keep(Manifold.hull(pts));
    const g = h.getMesh();
    return keep(new Manifold(new Mesh({ numProp: g.numProp, vertProperties: g.vertProperties, triVerts: g.triVerts, faceID: new Uint32Array(g.numTri).fill(color) })));
  };
  for (const patch of patches) {
    // local vertex numbering: top i, bottom i + n
    const local = new Map<number, number>();
    const vl: number[] = [];
    for (const t of patch) for (let k = 0; k < 3; k++) {
      const v = index[t * 3 + k]!;
      if (!local.has(v)) { local.set(v, vl.length); vl.push(v); }
    }
    const n = vl.length;
    const vp = new Float32Array(n * 6);
    vl.forEach((v, i) => {
      vp[i * 3] = verts[v * 3]!; vp[i * 3 + 1] = verts[v * 3 + 1]!; vp[i * 3 + 2] = verts[v * 3 + 2]! + LIFT;
      vp[(i + n) * 3] = verts[v * 3]!; vp[(i + n) * 3 + 1] = verts[v * 3 + 1]!; vp[(i + n) * 3 + 2] = floor;
    });
    const tv: number[] = [], fid: number[] = [];
    const inPatch = new Map<number, number>(); // directed edge → triangle
    for (const t of patch) {
      const c = a.mesh.faceColors[t]!;
      const i0 = local.get(index[t * 3]!)!, i1 = local.get(index[t * 3 + 1]!)!, i2 = local.get(index[t * 3 + 2]!)!;
      tv.push(i0, i2, i1); fid.push(c); // top, flipped
      tv.push(i0 + n, i1 + n, i2 + n); fid.push(c); // bottom
      inPatch.set(i0 * n + i1, t); inPatch.set(i1 * n + i2, t); inPatch.set(i2 * n + i0, t);
    }
    for (const [key, t] of inPatch) {
      const p = Math.floor(key / n), q = key % n;
      if (inPatch.has(q * n + p)) continue;
      const c = a.mesh.faceColors[t]!;
      tv.push(p, q, q + n, p, q + n, p + n); fid.push(c, c);
    }
    try {
      const mesh = new Mesh({ numProp: 3, vertProperties: vp, triVerts: Uint32Array.from(tv), faceID: Uint32Array.from(fid) });
      const m = keep(new Manifold(mesh));
      if (m.status() !== 'NoError' || m.isEmpty()) throw new Error(m.status());
      solids.push(m);
    } catch {
      for (const t of patch) solids.push(prism([index[t * 3]!, index[t * 3 + 1]!, index[t * 3 + 2]!], a.mesh.faceColors[t]!));
    }
  }
  const out = keep(Manifold.union([obj, ...solids]));
  const fallback = dominantColor(a.mesh.faceColors);
  return { mesh: fromManifold(out, (id) => (id < a.paletteSize ? id : fallback)), added: out.volume() - obj.volume() };
}) as never);

// ---------------------------------------------------------------- brim ears (reimplemented)

registerOp('brimEars', (async (a: { mesh: KernelMesh; diameter: number; height: number; maxAngle: number; color: number | null; paletteSize: number }) => {
  const { Manifold } = await wasm();
  const m = await toManifold(a.mesh);
  const bb = m.boundingBox();
  const z0 = bb.min[2]!;
  const cs = m.slice(z0 + Math.min(0.1, (bb.max[2]! - z0) / 4));
  const simple = cs.simplify(0.05);
  cs.delete();
  const polys = simple.toPolygons() as Array<Array<[number, number]>>;
  simple.delete();
  const corners: Array<[number, number]> = [];
  const limit = (a.maxAngle * Math.PI) / 180;
  for (const poly of polys) {
    let area = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) area += poly[j]![0] * poly[i]![1] - poly[i]![0] * poly[j]![1];
    if (area <= 0) continue; // holes
    for (let i = 0; i < poly.length; i++) {
      const p = poly[(i + poly.length - 1) % poly.length]!, c = poly[i]!, nx = poly[(i + 1) % poly.length]!;
      const ax = p[0] - c[0], ay = p[1] - c[1], bx = nx[0] - c[0], by = nx[1] - c[1];
      const cross = bx * ay - by * ax; // >0 for a convex corner of a CCW contour
      if (cross <= 0) continue;
      const angle = Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by) || 1))));
      if (angle <= limit) corners.push(c);
    }
  }
  // drop ears whose centres are closer than one radius
  const kept: Array<[number, number]> = [];
  for (const c of corners) if (kept.every((k) => Math.hypot(k[0] - c[0], k[1] - c[1]) > a.diameter / 2)) kept.push(c);
  if (!kept.length) throw new KernelError('No sharp corners found on the bottom outline. Increase “Corners sharper than”.');
  const color = a.color ?? dominantColor(a.mesh.faceColors);
  const discs = kept.map((c) => keep(keep(Manifold.cylinder(a.height, a.diameter / 2, a.diameter / 2, 48)).translate([c[0], c[1], z0])));
  const ears = keep(Manifold.union(discs));
  const g = ears.getMesh();
  g.faceID = new Uint32Array(g.numTri).fill(color);
  const { Mesh } = await wasm();
  const earsTagged = keep(new Manifold(new Mesh({ numProp: g.numProp, vertProperties: g.vertProperties, triVerts: g.triVerts, faceID: g.faceID })));
  const out = keep(m.add(earsTagged));
  return { mesh: fromManifold(out, (id) => (id < a.paletteSize ? id : color)), ears: kept.length };
}) as never);

// ---------------------------------------------------------------- normals + shells (repair, reimplemented)

/**
 * Makes triangle winding consistent inside each piece (flood fill across
 * manifold edges), then flips whole pieces so outer shells face out and
 * cavities face in. Returns the number of flipped triangles.
 */
export function orientSoup(positions: Float32Array): { positions: Float32Array; flipped: number; pieces: number } {
  const p = positions.slice();
  const tris = p.length / 9;
  const { index, count } = weld(p, 1e-5);
  const ekey = (a: number, b: number) => (a < b ? a * count + b : b * count + a);
  const edges = new Map<number, number[]>();
  for (let t = 0; t < tris; t++) for (let k = 0; k < 3; k++) {
    const key = ekey(index[t * 3 + k]!, index[t * 3 + ((k + 1) % 3)]!);
    const l = edges.get(key);
    if (l) l.push(t); else edges.set(key, [t]);
  }
  const flip = new Uint8Array(tris);
  const comp = new Int32Array(tris).fill(-1);
  const dir = (t: number, a: number, b: number) => {
    // +1 if t (with its current flip) has directed edge a→b, -1 if b→a
    for (let k = 0; k < 3; k++) {
      const x = index[t * 3 + k]!, y = index[t * 3 + ((k + 1) % 3)]!;
      if (x === a && y === b) return flip[t] ? -1 : 1;
      if (x === b && y === a) return flip[t] ? 1 : -1;
    }
    return 0;
  };
  let pieces = 0;
  for (let s = 0; s < tris; s++) {
    if (comp[s]! >= 0) continue;
    const id = pieces++;
    comp[s] = id;
    const stack = [s];
    while (stack.length) {
      const t = stack.pop()!;
      for (let k = 0; k < 3; k++) {
        const a = index[t * 3 + k]!, b = index[t * 3 + ((k + 1) % 3)]!;
        const l = edges.get(ekey(a, b))!;
        if (l.length !== 2) continue;
        const u = l[0] === t ? l[1]! : l[0]!;
        if (comp[u]! >= 0) continue;
        comp[u] = id;
        if (dir(u, a, b) === dir(t, a, b)) flip[u] = 1;
        stack.push(u);
      }
    }
  }
  const swap = (t: number) => {
    for (let k = 0; k < 3; k++) {
      const x = p[t * 9 + 3 + k]!;
      p[t * 9 + 3 + k] = p[t * 9 + 6 + k]!;
      p[t * 9 + 6 + k] = x;
    }
  };
  for (let t = 0; t < tris; t++) if (flip[t]) swap(t);
  // per piece: outward unless nested an odd number of times
  const lists: number[][] = Array.from({ length: pieces }, () => []);
  for (let t = 0; t < tris; t++) lists[comp[t]!]!.push(t);
  const soups = lists.map((l) => subset({ positions: p, faceColors: new Uint16Array(tris) }, l).positions);
  const boxes = soups.map(bbox);
  for (let i = 0; i < pieces; i++) {
    let depth = 0;
    if (pieces <= 64) {
      const s = soups[i]!;
      for (let j = 0; j < pieces; j++) {
        if (j === i) continue;
        const contains = [0, 1, 2].every((a) => boxes[j]!.min[a]! <= boxes[i]!.min[a]! && boxes[j]!.max[a]! >= boxes[i]!.max[a]!);
        if (contains && insideSoup(soups[j]!, s[0]!, s[1]!, s[2]!)) depth++;
      }
    }
    const vol = signedVolume(soups[i]!);
    if ((depth % 2 === 0 && vol < 0) || (depth % 2 === 1 && vol > 0)) for (const t of lists[i]!) { swap(t); flip[t] = flip[t]! ^ 1; }
  }
  let flipped = 0;
  for (let t = 0; t < tris; t++) if (flip[t]) flipped++;
  return { positions: p, flipped, pieces };
}

registerOp('fixNormals', (async (a: { mesh: KernelMesh }) => {
  const r = orientSoup(a.mesh.positions);
  return { mesh: { positions: r.positions, faceColors: a.mesh.faceColors }, flipped: r.flipped, pieces: r.pieces };
}) as never);

/** Overlapping or intersecting pieces are united into one clean solid (cavities are subtracted). */
registerOp('mergeShells', (async (a: { mesh: KernelMesh; paletteSize: number }) => {
  const { Manifold } = await wasm();
  const oriented = orientSoup(a.mesh.positions).positions;
  const mesh = { positions: oriented, faceColors: a.mesh.faceColors };
  const list = shells(oriented).map((t) => subset(mesh, t));
  const solid: ManifoldT[] = [], holes: ManifoldT[] = [];
  for (let i = 0; i < list.length; i++) {
    const s = list[i]!;
    const v = signedVolume(s.positions);
    if (v < 0) {
      for (let o = 0; o < s.positions.length; o += 9) for (let k = 0; k < 3; k++) {
        const x = s.positions[o + 3 + k]!;
        s.positions[o + 3 + k] = s.positions[o + 6 + k]!;
        s.positions[o + 6 + k] = x;
      }
    }
    const m = await toManifold(s, `Piece ${i + 1} of ${list.length}`);
    (v < 0 ? holes : solid).push(m);
  }
  if (!solid.length) throw new KernelError('No closed outer shell found.');
  let out = keep(Manifold.union(solid));
  if (holes.length) out = keep(out.subtract(keep(Manifold.union(holes))));
  const fallback = dominantColor(a.mesh.faceColors);
  return { mesh: fromManifold(out, (id) => (id < a.paletteSize ? id : fallback)), before: list.length, after: out.decompose().map(keep).length };
}) as never);

// ---------------------------------------------------------------- many parallel cuts (slabs)

/** Cuts into `count` equal slabs along `normal`, between the object's extremes; `gap` spreads them apart. */
registerOp('slabs', (async (a: { mesh: KernelMesh; normal: Vec3; count: number; gap: number; paletteSize: number }) => {
  const m = await toManifold(a.mesh);
  const n = a.normal;
  const { verts, count } = weld(a.mesh.positions, 1e-5);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < count; i++) {
    const d = verts[i * 3]! * n[0] + verts[i * 3 + 1]! * n[1] + verts[i * 3 + 2]! * n[2];
    if (d < lo) lo = d;
    if (d > hi) hi = d;
  }
  const k = Math.max(2, Math.min(200, Math.round(a.count)));
  const step = (hi - lo) / k;
  const parts: ManifoldT[] = [];
  let rest = m;
  for (let i = 1; i < k; i++) {
    const [above, below] = rest.splitByPlane(n, lo + step * i);
    keep(above); keep(below);
    if (!below.isEmpty()) parts.push(below);
    rest = above;
  }
  if (!rest.isEmpty()) parts.push(rest);
  if (parts.length < 2) throw new KernelError('The object could not be split into slabs.');
  const cap = dominantColor(a.mesh.faceColors);
  const map = (id: number) => (id < a.paletteSize ? id : cap);
  return {
    parts: parts.map((p, i) => {
      const moved = a.gap > 0 ? keep(p.translate([n[0] * a.gap * i, n[1] * a.gap * i, n[2] * a.gap * i])) : p;
      return fromManifold(moved, map);
    }),
  };
}) as never);

// ---------------------------------------------------------------- remesh (rebuild as one clean solid)

/**
 * Rebuilds any mesh — self-intersecting, overlapping, slightly open — as one
 * watertight solid: signed distance (BVH distance + non-zero winding along
 * rays) sampled on a grid and contoured with Manifold.levelSet. Colours come
 * from the nearest original triangle. Detail smaller than `resolution` is lost.
 */
registerOp('remesh', (async (a: { mesh: KernelMesh; resolution: number; paletteSize: number }) => {
  const { Manifold, Mesh } = await wasm();
  const { BufferAttribute, BufferGeometry, Ray, Vector3, DoubleSide } = await import('three');
  const { MeshBVH } = await import('three-mesh-bvh');
  const oriented = orientSoup(a.mesh.positions).positions;
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(oriented, 3));
  const bvh = new MeshBVH(geo);
  const index = geo.getIndex()!; // MeshBVH adds an index and reorders it; map hits back to triangles
  const triOf = (bvhTri: number) => Math.floor(index.getX(bvhTri * 3) / 3);
  const box = bbox(oriented);
  const size = [0, 1, 2].map((i) => box.max[i]! - box.min[i]!);
  const edge = a.resolution > 0 ? a.resolution : Math.max(Math.max(...size) / 110, 0.2);
  const pad = edge * 2;
  const p = new Vector3();
  const hit = { point: new Vector3(), distance: 0, faceIndex: 0 };
  const dirs = [new Vector3(1, 0.000123, 0.000317), new Vector3(0.000211, 1, 0.000173), new Vector3(0.000137, 0.000291, 1)].map((d) => d.normalize());
  const ray = new Ray();
  const nrm = new Vector3();
  const winding = (d: InstanceType<typeof Vector3>) => {
    ray.origin.copy(p);
    ray.direction.copy(d);
    let w = 0;
    for (const h of bvh.raycast(ray, DoubleSide)) {
      const t = triOf(h.faceIndex!);
      const o = t * 9;
      const ux = oriented[o + 3]! - oriented[o]!, uy = oriented[o + 4]! - oriented[o + 1]!, uz = oriented[o + 5]! - oriented[o + 2]!;
      const vx = oriented[o + 6]! - oriented[o]!, vy = oriented[o + 7]! - oriented[o + 1]!, vz = oriented[o + 8]! - oriented[o + 2]!;
      nrm.set(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
      w += nrm.dot(d) > 0 ? 1 : -1; // leaving a solid counts +1
    }
    return w;
  };
  const far = edge * 3;
  const sdf = (v: Vec3) => {
    p.set(v[0], v[1], v[2]);
    const found = bvh.closestPointToPoint(p, hit as never, 0, far);
    const d = found ? hit.distance : far;
    // non-zero winding = union of everything; near the surface vote over three rays
    let inside: boolean;
    if (d < far) {
      let votes = 0;
      for (const dir of dirs) if (winding(dir) !== 0) votes++;
      inside = votes >= 2;
    } else inside = winding(dirs[0]!) !== 0;
    return inside ? d : -d;
  };
  const out = keep(Manifold.levelSet(sdf, { min: [box.min[0]! - pad, box.min[1]! - pad, box.min[2]! - pad], max: [box.max[0]! + pad, box.max[1]! + pad, box.max[2]! + pad] }, edge, 0));
  if (out.isEmpty()) {
    geo.dispose();
    throw new KernelError('Nothing solid was found to rebuild. The mesh may be a single open surface.');
  }
  // colour each new triangle like the nearest original one
  const g = out.getMesh();
  const ids = new Uint32Array(g.numTri);
  for (let t = 0; t < g.numTri; t++) {
    let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < 3; k++) {
      const v = g.triVerts[t * 3 + k]!;
      cx += g.vertProperties[v * g.numProp]!; cy += g.vertProperties[v * g.numProp + 1]!; cz += g.vertProperties[v * g.numProp + 2]!;
    }
    p.set(cx / 3, cy / 3, cz / 3);
    const f = bvh.closestPointToPoint(p, hit as never);
    ids[t] = f ? a.mesh.faceColors[triOf(hit.faceIndex)] ?? 0 : 0;
  }
  geo.dispose();
  const colored = keep(new Manifold(new Mesh({ numProp: g.numProp, vertProperties: g.vertProperties, triVerts: g.triVerts, faceID: ids })));
  return { mesh: fromManifold(colored, (id) => (id < a.paletteSize ? id : 0)), edge, volume: colored.volume() };
}) as never);

// ---------------------------------------------------------------- refine for painting

/** Splits triangles until no edge is longer than `length` (shape unchanged; colours kept). */
registerOp('refine', (async (a: { mesh: KernelMesh; length: number; paletteSize: number; maxTriangles: number }) => {
  const m = await toManifold(a.mesh);
  const bb = m.boundingBox();
  const diag = Math.hypot(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]);
  const len = Math.max(a.length, diag / 2000);
  const out = keep(m.refineToLength(len));
  if (out.numTri() > a.maxTriangles) throw new KernelError(`That would make ${out.numTri().toLocaleString()} triangles. Use a longer edge length.`);
  const fallback = dominantColor(a.mesh.faceColors);
  return { mesh: fromManifold(out, (id) => (id < a.paletteSize ? id : fallback)) };
}) as never);

// ---------------------------------------------------------------- outlines for laser cutting

/** Outline polygons of each mesh seen from above (projection) or cut at height z (slice). */
registerOp('outline', (async (a: { meshes: KernelMesh[]; mode: 'project' | 'slice'; z: number }) => {
  const out: Array<Array<Array<[number, number]>>> = [];
  for (const mesh of a.meshes) {
    let polys: Array<Array<[number, number]>> = [];
    try {
      const m = await toManifold(mesh);
      const bb = m.boundingBox();
      const cs = a.mode === 'project' ? m.project() : m.slice(bb.min[2]! + (a.z > 0 ? a.z : (bb.max[2]! - bb.min[2]!) / 2));
      polys = cs.toPolygons() as Array<Array<[number, number]>>;
      cs.delete();
    } catch {
      polys = [];
    }
    out.push(polys);
  }
  return { outlines: out };
}) as never);
