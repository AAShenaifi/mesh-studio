// Shared kernel core: Wasm loading, memory scope, conversions and the op registry.
import Module, { type Manifold as ManifoldT, type ManifoldToplevel, type Mat4, type Vec3 } from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import { analyzeSoup, dominantColor, expand, weld } from './meshOps';
import type { KernelMesh } from './protocol';
import { connectorSolid, grooveTrapezoid, holeSolid, type ConnectorShape, type ConnectorStyle, type ConnectorType, type Groove } from '../ported/cut/connectors';

let wasmPromise: Promise<ManifoldToplevel> | null = null;
export function wasm(): Promise<ManifoldToplevel> {
  wasmPromise ??= Module({ locateFile: () => wasmUrl }).then((m) => {
    m.setup();
    return m;
  });
  return wasmPromise;
}

/** faceID reserved for faces created by tools (cut caps, pin holes, primitives). */
export const TOOL_ID = 60000;

export class KernelError extends Error {}

// Manifolds hold Wasm memory; every op registers what it creates and frees it at the end.
let scope: ManifoldT[] = [];
export const keep = <T extends ManifoldT>(m: T): T => {
  scope.push(m);
  return m;
};

export async function toManifold(mesh: KernelMesh, what = 'This object'): Promise<ManifoldT> {
  const { Manifold, Mesh } = await wasm();
  // Weld with a fast hash first: an indexed mesh is far cheaper for Manifold
  // than a 3-vertices-per-triangle soup it would have to merge itself.
  const { index, verts } = weld(mesh.positions, 1e-5);
  const m = new Mesh({ numProp: 3, vertProperties: Float32Array.from(verts), triVerts: index, faceID: Uint32Array.from(mesh.faceColors) });
  m.merge();
  try {
    const out = keep(new Manifold(m));
    if (out.status() !== 'NoError') throw new Error(out.status());
    return out;
  } catch {
    const a = analyzeSoup(mesh.positions);
    throw new KernelError(
      `${what} is not watertight (${a.boundaryEdges} open edges, ${a.nonManifoldEdges} non-manifold edges). Run Repair in the Analysis panel first.`,
    );
  }
}

/** Rebuilds a Manifold with every face tagged `id`. */
export async function tagged(m: ManifoldT, id: number): Promise<ManifoldT> {
  const { Manifold, Mesh } = await wasm();
  const g = m.getMesh();
  return keep(new Manifold(new Mesh({ numProp: g.numProp, vertProperties: g.vertProperties, triVerts: g.triVerts, faceID: new Uint32Array(g.numTri).fill(id) })));
}

export function fromManifold(m: ManifoldT, mapId: (id: number) => number): KernelMesh {
  const g = m.getMesh();
  return expand(g.vertProperties, g.numProp, g.triVerts, g.faceID, mapId);
}

/** Rotation (column-major Mat4) taking +Z onto unit vector n, plus translation t. */
export function frameZto(n: Vec3, t: Vec3 = [0, 0, 0]): Mat4 {
  const [x, y, z] = n;
  let r: number[];
  if (z > 0.999999) r = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  else if (z < -0.999999) r = [1, 0, 0, 0, -1, 0, 0, 0, -1];
  else {
    // Rodrigues: axis = z × n, cos = n.z
    const ax = -y, ay = x; // (0,0,1) × (x,y,z) = (-y, x, 0)
    const s = Math.hypot(ax, ay), c = z;
    const ux = ax / s, uy = ay / s;
    const C = 1 - c;
    // row-major r[row*3+col]
    r = [c + ux * ux * C, ux * uy * C, uy * s, ux * uy * C, c + uy * uy * C, -ux * s, -uy * s, ux * s, c];
  }
  return [r[0]!, r[3]!, r[6]!, 0, r[1]!, r[4]!, r[7]!, 0, r[2]!, r[5]!, r[8]!, 0, t[0], t[1], t[2], 1];
}
export function transposeRot(m: Mat4): Mat4 {
  return [m[0], m[4], m[8], 0, m[1], m[5], m[9], 0, m[2], m[6], m[10], 0, 0, 0, 0, 1];
}
export const applyMat = (m: Mat4, p: Vec3): Vec3 => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
];

function pointInPolygons(px: number, py: number, polys: Array<Array<[number, number]>>): boolean {
  let inside = false;
  for (const poly of polys) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i]!, [xj, yj] = poly[j]!;
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

export interface ConnectorArgs {
  type: 'none' | ConnectorType | 'snap';
  style: ConnectorStyle;
  shape: ConnectorShape;
  /** Circumscribed diameter. */
  size: number;
  /** Plug height, or hole depth into each half for dowels. */
  depth: number;
  sizeTolerance: number;
  depthTolerance: number;
  /** Turn about the normal, degrees (polygon shapes). */
  rotation: number;
  placement: 'auto1' | 'auto2' | 'manual';
  /** World points on the plane (manual placement). */
  points: Vec3[];
  makeDowels: boolean;
}

export interface CutArgs {
  mesh: KernelMesh;
  normal: Vec3;
  /** Plane: dot(normal, x) = offset. */
  offset: number;
  /** Plane centre (world); the dovetail is centred here. */
  origin?: Vec3;
  gap: number;
  capColor: number | null;
  connectors: ConnectorArgs;
  /** Dovetail groove instead of a flat cut (angles in degrees). */
  groove: { depth: number; width: number; flapsAngle: number; angle: number; depthTolerance: number; widthTolerance: number } | null;
  paletteSize: number;
}

async function hullAt(points: Array<[number, number, number]>, frame: Mat4, id: number): Promise<ManifoldT> {
  const { Manifold } = await wasm();
  return keep(await tagged(keep(Manifold.hull(points.map((p) => applyMat(frame, p)))), id));
}

/** Auto placement: 1 point near the middle of the cut face or the 2 farthest apart, keeping `r` + 1.2 mm inside it. */
async function autoPoints(m: ManifoldT, n: Vec3, offset: number, r: number, count: number): Promise<Vec3[]> {
  const frame = frameZto(n, [0, 0, 0]);
  const section = keep(m.transform(transposeRot(frame)));
  const cs = section.slice(offset);
  const inset = cs.offset(-(r + 1.2), 'Round');
  const polys = inset.toPolygons() as Array<Array<[number, number]>>;
  const b = inset.bounds();
  cs.delete();
  if (!polys.length || inset.isEmpty()) {
    inset.delete();
    throw new KernelError('The cut face is too small for connectors of this size. Use smaller connectors or none.');
  }
  const candidates: Array<[number, number]> = [];
  const N = 24;
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const px = b.min[0] + ((b.max[0] - b.min[0]) * i) / N;
    const py = b.min[1] + ((b.max[1] - b.min[1]) * j) / N;
    if (pointInPolygons(px, py, polys)) candidates.push([px, py]);
  }
  inset.delete();
  if (!candidates.length) throw new KernelError('Could not find room for connectors on the cut face.');
  const cx = (b.min[0] + b.max[0]) / 2, cy = (b.min[1] + b.max[1]) / 2;
  let chosen: Array<[number, number]>;
  if (count === 1 || candidates.length === 1) {
    chosen = [candidates.reduce((best, p) => (Math.hypot(p[0] - cx, p[1] - cy) < Math.hypot(best[0] - cx, best[1] - cy) ? p : best))];
  } else {
    let best: [[number, number], [number, number]] = [candidates[0]!, candidates[0]!];
    let bestD = -1;
    for (let i = 0; i < candidates.length; i++) for (let j = i + 1; j < candidates.length; j++) {
      const d = Math.hypot(candidates[i]![0] - candidates[j]![0], candidates[i]![1] - candidates[j]![1]);
      if (d > bestD) { bestD = d; best = [candidates[i]!, candidates[j]!]; }
    }
    chosen = best;
  }
  return chosen.map(([px, py]) => applyMat(frame, [px, py, offset]));
}

/** Checks that each manual connector sits on the cut face (inside the section). */
async function checkOnFace(m: ManifoldT, n: Vec3, offset: number, points: Vec3[]) {
  const frame = frameZto(n, [0, 0, 0]);
  const toLocal = transposeRot(frame);
  const cs = keep(m.transform(toLocal)).slice(offset);
  const polys = cs.toPolygons() as Array<Array<[number, number]>>;
  cs.delete();
  points.forEach((p, i) => {
    const l = applyMat(toLocal, p);
    if (!pointInPolygons(l[0], l[1], polys)) throw new KernelError(`Connector ${i + 1} is not on the cut face. Click inside the cut outline.`);
  });
}

/** Snap-fit connector solids in the connector frame (z = cut normal, origin on the plane). */
async function snapConnector(r: number, h: number, tol: number, depthTol: number): Promise<{ plug: ManifoldT; socket: ManifoldT }> {
  const { Manifold } = await wasm();
  const bulge = Math.max(0.3, r * 0.18);
  const z0 = h * 0.55, z1 = h * 0.8;
  const ring = (rr: number, extra: number) =>
    keep(Manifold.union([
      keep(keep(Manifold.cylinder(z1 - z0, rr + extra, rr + extra, 48)).translate([0, 0, z0])),
      keep(keep(Manifold.cylinder(h - z1, rr + extra, rr * 0.92, 48)).translate([0, 0, z1])),
    ]));
  const stem = keep(Manifold.cylinder(h, r, r, 48));
  let plug = keep(Manifold.union([stem, ring(r, bulge)]));
  // slot so the two halves of the plug flex inwards while it snaps in
  const slot = keep(keep(Manifold.cube([Math.max(0.6, r * 0.35), 4 * (r + bulge), h], true)).translate([0, 0, h * 0.3 + h / 2]));
  plug = keep(plug.subtract(slot));
  plug = keep(await tagged(plug, TOOL_ID));
  const sock = keep(Manifold.union([
    keep(keep(Manifold.cylinder(h + depthTol + 0.01, r + tol, r + tol, 48)).translate([0, 0, -0.01])),
    ring(r + tol, bulge),
  ]));
  return { plug, socket: keep(await tagged(sock, TOOL_ID)) };
}

export async function cut(a: CutArgs) {
  const { Manifold } = await wasm();
  const m = await toManifold(a.mesh);
  const n = a.normal;
  const bb = m.boundingBox();
  const diag = Math.hypot(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]);
  const L = diag * 4 + 20;
  const o = a.origin ?? [0, 0, 0];
  const along = a.offset - (n[0] * o[0] + n[1] * o[1] + n[2] * o[2]);
  const frame = frameZto(n, [o[0] + n[0] * along, o[1] + n[1] * along, o[2] + n[2] * along]);
  let above: ManifoldT, below: ManifoldT;
  if (a.groove) {
    // Dovetail (ported groove geometry): upper = (z > d/2) ∪ shrunk trapezoid; lower = rest minus nominal trapezoid.
    const rad = Math.PI / 180;
    const g: Groove = { ...a.groove, flapsAngle: a.groove.flapsAngle * rad, angle: a.groove.angle * rad };
    if (!(g.depth > 0 && g.width > 0 && g.flapsAngle > 0.05 && g.flapsAngle < Math.PI - 0.05)) throw new KernelError('Invalid dovetail settings.');
    const c = Math.cos(g.angle), sn = Math.sin(g.angle);
    const local = (x: number, y: number, z: number): [number, number, number] => [x * c - y * sn, x * sn + y * c, z];
    const prism = (pts: Array<[number, number]>) => pts.flatMap(([x, z]) => [local(x, -L, z), local(x, L, z)]);
    const half = g.depth / 2;
    const upBox = await hullAt(prism([[-L, half], [L, half], [L, L], [-L, L]]), frame, TOOL_ID);
    const nominal = await hullAt(prism(grooveTrapezoid(g, false, 0.01)), frame, TOOL_ID);
    const shrunk = await hullAt(prism(grooveTrapezoid(g, true, 0.01)), frame, TOOL_ID);
    above = keep(m.intersect(keep(upBox.add(shrunk))));
    below = keep(m.subtract(keep(upBox.add(nominal))));
  } else {
    const halfSpace = keep((await tagged(keep(Manifold.cube([L, L, L])), TOOL_ID)).translate([-L / 2, -L / 2, 0])).transform(frame);
    keep(halfSpace);
    above = keep(m.intersect(halfSpace));
    below = keep(m.subtract(halfSpace));
  }
  if (above.isEmpty() || below.isEmpty()) throw new KernelError('The cut plane does not pass through the object. Move it inside the object first.');

  const dowels: KernelMesh[] = [];
  const pinPoints: Vec3[] = [];
  const c = a.connectors;
  if (!a.groove && c.type !== 'none') {
    const r = c.size / 2;
    const points = c.placement === 'manual' ? c.points : await autoPoints(m, n, a.offset, r + c.sizeTolerance, c.placement === 'auto1' ? 1 : 2);
    if (!points.length) throw new KernelError('Click on the cut face to place connectors, or choose automatic placement.');
    if (c.placement === 'manual') await checkOnFace(m, n, a.offset, points);
    const rot = (c.rotation * Math.PI) / 180;
    for (const p of points) {
      const at = frameZto(n, p);
      pinPoints.push(p);
      if (c.type === 'snap') {
        // Snap-fit (Mesh Studio's own design): slotted plug with a barb ring on the lower part,
        // matching socket with an undercut groove in the upper part.
        const { plug, socket } = await snapConnector(r, c.depth, c.sizeTolerance, c.depthTolerance);
        above = keep(above.subtract(keep(socket.transform(at))));
        below = keep(below.add(keep(plug.transform(at))));
        continue;
      }
      const hole = await hullAt(holeSolid(c.type, c.style, c.shape, r, c.depth, c.sizeTolerance, c.depthTolerance, rot).points, at, TOOL_ID);
      above = keep(above.subtract(hole));
      if (c.type === 'plug') {
        const plug = await hullAt(connectorSolid('plug', c.style, c.shape, r, c.depth, rot).points, at, TOOL_ID);
        below = keep(below.add(plug));
      } else {
        below = keep(below.subtract(hole));
        if (c.makeDowels) {
          const dowel = keep(Manifold.hull(connectorSolid('dowel', c.style, c.shape, r, c.depth, rot).points));
          dowels.push(fromManifold(dowel, () => 0));
        }
      }
    }
  }
  if (a.gap > 0) {
    above = keep(above.translate([(n[0] * a.gap) / 2, (n[1] * a.gap) / 2, (n[2] * a.gap) / 2]));
    below = keep(below.translate([(-n[0] * a.gap) / 2, (-n[1] * a.gap) / 2, (-n[2] * a.gap) / 2]));
  }
  const cap = a.capColor ?? dominantColor(a.mesh.faceColors);
  const map = (id: number) => (id < a.paletteSize ? id : cap);
  for (const d of dowels) d.faceColors.fill(cap);
  return { above: fromManifold(above, map), below: fromManifold(below, map), pins: dowels, pinPoints, volumes: [above.volume(), below.volume()] };
}

export async function analyze(a: { mesh: KernelMesh }) {
  const report = analyzeSoup(a.mesh.positions);
  let manifold = false;
  let genus: number | null = null;
  let status = 'not checked';
  if (report.watertight) {
    try {
      const m = await toManifold(a.mesh);
      manifold = true;
      genus = m.genus();
      status = 'NoError';
    } catch {
      status = 'NotManifold';
    }
  } else status = 'open or non-manifold edges';
  return { ...report, manifold, genus, status };
}

/**
 * Simple repair: weld vertices, drop degenerate/duplicate triangles, fill
 * boundary loops (projected and triangulated), then rebuild through Manifold.
 */
export async function repair(a: { mesh: KernelMesh; paletteSize: number }) {
  const { triangulate, Manifold, Mesh } = await wasm();
  const { positions, faceColors } = a.mesh;
  const { index, verts, count } = weld(positions, 1e-4);
  const tris: number[] = [];
  const cols: number[] = [];
  const seen = new Set<string>();
  let removed = 0;
  for (let t = 0; t < faceColors.length; t++) {
    const i0 = index[t * 3]!, i1 = index[t * 3 + 1]!, i2 = index[t * 3 + 2]!;
    if (i0 === i1 || i1 === i2 || i0 === i2) { removed++; continue; }
    const key = [i0, i1, i2].sort((x, y) => x - y).join(',');
    if (seen.has(key)) { removed++; continue; }
    seen.add(key);
    tris.push(i0, i1, i2);
    cols.push(faceColors[t]!);
  }
  // boundary half-edges: a→b present without b→a
  const directed = new Map<number, number>();
  const key = (p: number, q: number) => p * count + q;
  for (let t = 0; t < tris.length; t += 3) for (let k = 0; k < 3; k++) {
    const p = tris[t + k]!, q = tris[t + ((k + 1) % 3)]!;
    directed.set(key(p, q), (directed.get(key(p, q)) ?? 0) + 1);
  }
  const next = new Map<number, number[]>();
  for (const [k] of directed) {
    const p = Math.floor(k / count), q = k % count;
    if (!directed.has(key(q, p))) {
      const list = next.get(p) ?? [];
      list.push(q);
      next.set(p, list);
    }
  }
  const fillColor = dominantColor(faceColors);
  let holes = 0;
  const v3 = (i: number): Vec3 => [verts[i * 3]!, verts[i * 3 + 1]!, verts[i * 3 + 2]!];
  while (next.size) {
    const start = next.keys().next().value as number;
    const loop: number[] = [start];
    let cur = start;
    let guard = 0;
    for (;;) {
      const outs = next.get(cur);
      if (!outs || !outs.length) break;
      const nxt = outs.pop()!;
      if (!outs.length) next.delete(cur);
      if (nxt === start) break;
      loop.push(nxt);
      cur = nxt;
      if (++guard > 1e6) break;
    }
    if (loop.length < 3) continue;
    // Fill polygon runs opposite to the boundary half-edges.
    const poly = loop.slice().reverse();
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < poly.length; i++) {
      const p = v3(poly[i]!), q = v3(poly[(i + 1) % poly.length]!);
      nx += (p[1] - q[1]) * (p[2] + q[2]);
      ny += (p[2] - q[2]) * (p[0] + q[0]);
      nz += (p[0] - q[0]) * (p[1] + q[1]);
    }
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    // basis (u, v) with u × v = n
    const ref: Vec3 = Math.abs(nx) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    let ux = ref[1] * nz - ref[2] * ny, uy = ref[2] * nx - ref[0] * nz, uz = ref[0] * ny - ref[1] * nx;
    const ul = Math.hypot(ux, uy, uz); ux /= ul; uy /= ul; uz /= ul;
    const vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux;
    const pts2 = poly.map((i) => {
      const p = v3(i);
      return [p[0] * ux + p[1] * uy + p[2] * uz, p[0] * vx + p[1] * vy + p[2] * vz] as [number, number];
    });
    let triIdx: Vec3[];
    try {
      triIdx = poly.length === 3 ? [[0, 1, 2]] : triangulate([pts2], -1);
    } catch {
      triIdx = [];
      for (let i = 1; i < poly.length - 1; i++) triIdx.push([0, i, i + 1]);
    }
    for (const [i, j, k] of triIdx) {
      tris.push(poly[i]!, poly[j]!, poly[k]!);
      cols.push(fillColor);
    }
    holes++;
  }
  const triVerts = Uint32Array.from(tris);
  const faceID = Uint32Array.from(cols);
  let out: KernelMesh;
  let manifold = false;
  try {
    const mesh = new Mesh({ numProp: 3, vertProperties: Float32Array.from(verts), triVerts, faceID });
    mesh.merge();
    const m = keep(new Manifold(mesh));
    if (m.status() !== 'NoError') throw new Error(m.status());
    out = fromManifold(m, (id) => (id < a.paletteSize ? id : fillColor));
    manifold = true;
  } catch {
    out = expand(verts, 3, triVerts, faceID, (id) => id);
  }
  return { mesh: out, report: { holesFilled: holes, removedTriangles: removed, manifold } };
}

export const ops: Record<string, (args: never) => Promise<unknown>> = {
  analyze: analyze as never,
  repair: repair as never,
  cut: cut as never,
};
export function registerOp(name: string, fn: (args: never) => Promise<unknown>) {
  ops[name] = fn;
}
/** Frees every Manifold created during the current operation. */
export function freeScope() {
  for (const m of scope) {
    try { m.delete(); } catch { /* already freed */ }
  }
  scope = [];
}
