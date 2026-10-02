// Text / SVG projected onto a (curved) surface: the flat shape is refined, then
// every vertex is moved along the click normal onto the surface (a heightfield
// drape), and the result is united with (emboss) or cut from (engrave) the object.
// Reimplemented for Mesh Studio from the observed behaviour of 3D Builder's
// Emboss and the slicers' "use surface" option (no slicer code).
import type { Vec3 } from 'manifold-3d';
import { KernelError, fromManifold, keep, registerOp, tagged, toManifold } from './kernelCore';
import { dominantColor, weld } from './meshOps';
import type { KernelMesh } from './protocol';
import { wrapPoint, type WrapTable } from './wrapLookup';

export interface SurfaceShapeArgs {
  /** Target object, world soup. */
  mesh: KernelMesh;
  /** Flat shape soup: centred on the origin in XY, z from 0 to 1. */
  shape: KernelMesh;
  point: Vec3;
  normal: Vec3;
  /** Direction that should read as "up" in the text (projected onto the surface). */
  up: Vec3;
  rotation: number;
  mode: 'emboss' | 'engrave';
  /** Emboss height above the surface, or engrave depth. */
  height: number;
  color: number | null;
  paletteSize: number;
  /** Wrap like a sticker: surface table built on the main thread (overrides the straight projection). */
  wrap?: WrapTable;
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: Vec3): Vec3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** Tangent frame at the click: z = normal, y = "up" projected, x = y × z; turned by `rotation` degrees. */
function frame(n0: Vec3, up0: Vec3, rotation: number): [Vec3, Vec3, Vec3] {
  const n = unit(n0);
  let up = up0;
  if (Math.abs(dot(unit(up), n)) > 0.95) up = Math.abs(n[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0];
  let y = unit([up[0] - n[0] * dot(up, n), up[1] - n[1] * dot(up, n), up[2] - n[2] * dot(up, n)]);
  let x = cross(y, n);
  const r = (rotation * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  const xr: Vec3 = [x[0] * c + y[0] * s, x[1] * c + y[1] * s, x[2] * c + y[2] * s];
  const yr: Vec3 = [-x[0] * s + y[0] * c, -x[1] * s + y[1] * c, -x[2] * s + y[2] * c];
  x = xr; y = yr;
  return [x, y, n];
}

/** Heightfield query over the object's front-facing triangles, in the tangent frame. */
function surfaceQuery(p: Float32Array, origin: Vec3, f: [Vec3, Vec3, Vec3], extent: number) {
  const tris: number[] = [];
  const loc = new Float64Array(p.length);
  for (let i = 0; i < p.length; i += 3) {
    const d: Vec3 = [p[i]! - origin[0], p[i + 1]! - origin[1], p[i + 2]! - origin[2]];
    loc[i] = dot(d, f[0]); loc[i + 1] = dot(d, f[1]); loc[i + 2] = dot(d, f[2]);
  }
  for (let t = 0; t < p.length / 9; t++) {
    const o = t * 9;
    const ax = loc[o + 3]! - loc[o]!, ay = loc[o + 4]! - loc[o + 1]!, bx = loc[o + 6]! - loc[o]!, by = loc[o + 7]! - loc[o + 1]!;
    if (ax * by - ay * bx <= 1e-12) continue; // back-facing or edge-on in the projection
    const minX = Math.min(loc[o]!, loc[o + 3]!, loc[o + 6]!), maxX = Math.max(loc[o]!, loc[o + 3]!, loc[o + 6]!);
    const minY = Math.min(loc[o + 1]!, loc[o + 4]!, loc[o + 7]!), maxY = Math.max(loc[o + 1]!, loc[o + 4]!, loc[o + 7]!);
    if (maxX < -extent || minX > extent || maxY < -extent || minY > extent) continue;
    tris.push(t);
  }
  const N = 96;
  const cell = (2 * extent) / N;
  const grid: number[][] = Array.from({ length: N * N }, () => []);
  const ci = (v: number) => Math.max(0, Math.min(N - 1, Math.floor((v + extent) / cell)));
  for (const t of tris) {
    const o = t * 9;
    const x0 = ci(Math.min(loc[o]!, loc[o + 3]!, loc[o + 6]!)), x1 = ci(Math.max(loc[o]!, loc[o + 3]!, loc[o + 6]!));
    const y0 = ci(Math.min(loc[o + 1]!, loc[o + 4]!, loc[o + 7]!)), y1 = ci(Math.max(loc[o + 1]!, loc[o + 4]!, loc[o + 7]!));
    for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) grid[gy * N + gx]!.push(t);
  }
  /** Height of the surface nearest to the tangent plane at (x, y), or null when nothing is below/above. */
  return (x: number, y: number): number | null => {
    if (x < -extent || x > extent || y < -extent || y > extent) return null;
    let best: number | null = null;
    for (const t of grid[ci(y) * N + ci(x)]!) {
      const o = t * 9;
      const x1 = loc[o]!, y1 = loc[o + 1]!, x2 = loc[o + 3]!, y2 = loc[o + 4]!, x3 = loc[o + 6]!, y3 = loc[o + 7]!;
      const den = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3);
      if (Math.abs(den) < 1e-18) continue;
      const a = ((y2 - y3) * (x - x3) + (x3 - x2) * (y - y3)) / den;
      const b = ((y3 - y1) * (x - x3) + (x1 - x3) * (y - y3)) / den;
      const c = 1 - a - b;
      if (a < -1e-9 || b < -1e-9 || c < -1e-9) continue;
      const z = a * loc[o + 2]! + b * loc[o + 5]! + c * loc[o + 8]!;
      if (best === null || Math.abs(z) < Math.abs(best)) best = z;
    }
    return best;
  };
}

/**
 * Where the shape's many small edges cross one model edge, the boolean can leave vertices a few
 * nanometres apart. In float32 / after welding they become zero-area slivers that tools report as
 * "non-manifold". Snap those vertices together and drop the collapsed triangles (only if the
 * result stays closed).
 */
function dropCollapsed(mesh: KernelMesh): KernelMesh {
  const { index, verts, count } = weld(mesh.positions, 1e-4);
  const tris = mesh.faceColors.length;
  const keepT: number[] = [];
  let dropped = 0;
  for (let t = 0; t < tris; t++) {
    const i0 = index[t * 3]!, i1 = index[t * 3 + 1]!, i2 = index[t * 3 + 2]!;
    if (i0 === i1 || i1 === i2 || i0 === i2) dropped++;
    else keepT.push(t);
  }
  if (!dropped) return mesh;
  const edges = new Map<number, number>();
  for (const t of keepT) for (let k = 0; k < 3; k++) {
    const p = index[t * 3 + k]!, q = index[t * 3 + ((k + 1) % 3)]!;
    const key = p < q ? p * count + q : q * count + p;
    edges.set(key, (edges.get(key) ?? 0) + (p < q ? 1 : -1));
  }
  for (const v of edges.values()) if (v !== 0) return mesh; // would open the mesh: keep as is
  const positions = new Float32Array(keepT.length * 9);
  const faceColors = new Uint16Array(keepT.length);
  keepT.forEach((t, n) => {
    for (let k = 0; k < 3; k++) {
      const v = index[t * 3 + k]!;
      positions[n * 9 + k * 3] = verts[v * 3]!; positions[n * 9 + k * 3 + 1] = verts[v * 3 + 1]!; positions[n * 9 + k * 3 + 2] = verts[v * 3 + 2]!;
    }
    faceColors[n] = mesh.faceColors[t]!;
  });
  return { positions, faceColors };
}

registerOp('surfaceShape', (async (a: SurfaceShapeArgs) => {
  const obj = await toManifold(a.mesh);
  let shape = await toManifold(a.shape, 'The text/SVG shape');
  const bb = shape.boundingBox();
  const half = Math.max(Math.abs(bb.min[0]), Math.abs(bb.max[0]), Math.abs(bb.min[1]), Math.abs(bb.max[1]));
  if (!(half > 0)) throw new KernelError('The shape is empty.');
  const f = frame(a.normal, a.up, a.rotation);
  const surf = a.wrap ? () => 0 : surfaceQuery(a.mesh.positions, a.point, f, half * 1.05 + 1);
  // emboss: from slightly inside the surface up to `height`; engrave: from -depth to just above
  const sink = a.mode === 'emboss' ? Math.max(0.3, Math.min(1, a.height)) : a.height;
  const top = a.mode === 'emboss' ? a.height : 0.4;
  shape = keep(shape.scale([1, 1, top + sink])).translate([0, 0, -sink]);
  keep(shape);
  const edge = a.wrap ? Math.max(0.15, Math.min(a.wrap.dx, a.wrap.dy, 1)) : Math.max(0.2, Math.min(2, half / 30));
  shape = keep(shape.refineToLength(edge));
  const color = a.color ?? dominantColor(a.mesh.faceColors);
  shape = await tagged(shape, color);
  let misses = 0;
  const table = a.wrap;
  const tmp: [number, number, number] = [0, 0, 0];
  const warped = keep(
    shape.warp((v) => {
      if (table) {
        wrapPoint(table, v[0], v[1], v[2], tmp);
        v[0] = tmp[0]; v[1] = tmp[1]; v[2] = tmp[2];
        return;
      }
      let s = surf(v[0], v[1]);
      if (s === null) { misses++; s = 0; }
      const z = v[2] + s;
      const x = v[0], y = v[1];
      v[0] = a.point[0] + f[0][0] * x + f[1][0] * y + f[2][0] * z;
      v[1] = a.point[1] + f[0][1] * x + f[1][1] * y + f[2][1] * z;
      v[2] = a.point[2] + f[0][2] * x + f[1][2] * y + f[2][2] * z;
    }),
  );
  if (warped.isEmpty()) throw new KernelError('The projected shape is empty.');
  // drop sub-micron slivers where the bent shape grazes facets (they collapse to bad triangles in float32)
  const out = keep(a.mode === 'emboss' ? obj.add(warped) : obj.subtract(warped));
  const fallback = dominantColor(a.mesh.faceColors);
  return { mesh: dropCollapsed(fromManifold(out, (id) => (id < a.paletteSize ? id : fallback))), misses, volume: out.volume() - obj.volume() };
}) as never);
