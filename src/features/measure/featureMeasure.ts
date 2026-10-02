// Feature measuring like Bambu Studio / PrusaSlicer: the feature under the cursor
// (face, edge, circle/hole, corner) is found with the ported feature extraction in
// src/ported/measure; snapping and the measurement maths are Mesh Studio's own.
import { Matrix3, Matrix4, Vector3 } from 'three';
import { create } from 'zustand';
import { weld } from '../../geometry/meshOps';
import { objectMatrix } from '../../scene/geometry';
import type { SceneObject } from '../../scene/types';
import { Measuring, type SurfaceFeature, type V3 } from '../../ported/measure/features';
import { adjacency } from '../paint/meshQuery';

const cache = new WeakMap<object, Measuring>();

function measuringFor(o: SceneObject): Measuring {
  let m = cache.get(o.geometry);
  if (!m) {
    const pos = o.geometry.getAttribute('position').array as Float32Array;
    const { index, verts } = weld(pos);
    m = new Measuring(verts, index, adjacency(o.geometry).neighbors);
    cache.set(o.geometry, m);
  }
  return m;
}

/** How a point was obtained (shown next to the marker). */
export type SnapKind = 'corner' | 'midpoint' | 'centre' | 'edge' | 'surface';

/** Feature in world space. */
export type WorldFeature = SurfaceFeature & {
  /** Circle that came from a curved wall (cylinder / hole wall / fillet): its length along the axis. */
  cylinder?: { length: number };
  objectId: string;
  /** Plane: its triangles (for highlighting) and area in mm². */
  triangles?: number[];
  area?: number;
  /** Point: what it snapped to. */
  snap?: SnapKind;
};

const objScale = (o: SceneObject) => (Math.abs(o.scale[0]) + Math.abs(o.scale[1]) + Math.abs(o.scale[2])) / 3 || 1;

function toWorld(f: SurfaceFeature, o: SceneObject, triangles?: number[]): WorldFeature {
  const m = objectMatrix(o);
  const nm = new Matrix3().getNormalMatrix(m);
  const p = (v: V3): V3 => new Vector3(...v).applyMatrix4(m).toArray() as V3;
  const n = (v: V3): V3 => new Vector3(...v).applyMatrix3(nm).normalize().toArray() as V3;
  const base = { objectId: o.id };
  if (f.type === 'point') return { ...base, type: 'point', p: p(f.p), snap: 'corner' };
  if (f.type === 'edge') return { ...base, type: 'edge', a: p(f.a), b: p(f.b), ...(f.center ? { center: p(f.center) } : {}) };
  if (f.type === 'circle') return { ...base, type: 'circle', center: p(f.center), normal: n(f.normal), radius: f.radius * objScale(o) };
  let area = 0;
  if (triangles) {
    const src = o.geometry.getAttribute('position').array as Float32Array;
    const a = new Vector3(), b = new Vector3(), c = new Vector3();
    for (const t of triangles) {
      a.set(src[t * 9]!, src[t * 9 + 1]!, src[t * 9 + 2]!).applyMatrix4(m);
      b.set(src[t * 9 + 3]!, src[t * 9 + 4]!, src[t * 9 + 5]!).applyMatrix4(m);
      c.set(src[t * 9 + 6]!, src[t * 9 + 7]!, src[t * 9 + 8]!).applyMatrix4(m);
      area += b.sub(a).cross(c.sub(a)).length() / 2;
    }
  }
  return { ...base, type: 'plane', normal: n(f.normal), origin: p(f.origin), index: f.index, triangles, area };
}

export interface PickOptions {
  /** World tolerance (a few screen pixels at the hit point). */
  limit: number;
  /** Only the face (Alt). */
  onlyPlane?: boolean;
  /** A free point on the surface (Shift). */
  freePoint?: boolean;
  /** Snap to corners and edge midpoints (default true). */
  snapPoints?: boolean;
}

/**
 * Feature of object `o` at a hit: `tri` is the original triangle, `point` the
 * world hit point. Edge ends and edge midpoints snap to points.
 */
export function pickFeature(o: SceneObject, tri: number, point: Vector3, limitOrOpts: number | PickOptions, onlyPlane = false): WorldFeature | null {
  const opts: PickOptions = typeof limitOrOpts === 'number' ? { limit: limitOrOpts, onlyPlane } : limitOrOpts;
  if (opts.freePoint) return { objectId: o.id, type: 'point', p: point.toArray() as V3, snap: 'surface' };
  const meas = measuringFor(o);
  const inv = new Matrix4().copy(objectMatrix(o)).invert();
  const local = point.clone().applyMatrix4(inv).toArray() as V3;
  const lim = opts.limit / objScale(o);
  const snapPts = opts.snapPoints !== false;
  // On a curved wall (hole, cylinder, fillet) the facet borders are soft edges, not features: measure the wall itself.
  if (!opts.onlyPlane) {
    const cyl = fitCylinder(o, tri);
    if (cyl) return cyl;
  }
  const f = meas.getFeature(tri, local, lim, !!opts.onlyPlane, snapPts);
  if (!f) return null;
  const w = toWorld(f, o, f.type === 'plane' ? meas.planeTriangles(f) : undefined);
  if (w.type === 'edge' && snapPts) {
    const mid = new Vector3(...w.a).add(new Vector3(...w.b)).multiplyScalar(0.5);
    if (mid.distanceTo(point) < opts.limit * 1.5) return { objectId: o.id, type: 'point', p: mid.toArray() as V3, snap: 'midpoint' };
  }
  return w;
}

/** Smallest eigenvector of a symmetric 3×3 matrix (Jacobi rotations). */
function smallestEigenvector(m: number[][]): Vector3 {
  const a = m.map((r) => r.slice());
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 30; sweep++) {
    let off = 0;
    for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) off += a[p]![q]! ** 2;
    if (off < 1e-18) break;
    for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) {
      if (Math.abs(a[p]![q]!) < 1e-15) continue;
      const th = (a[q]![q]! - a[p]![p]!) / (2 * a[p]![q]!);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const c = 1 / Math.sqrt(t * t + 1), sn = t * c;
      for (let k = 0; k < 3; k++) {
        const akp = a[k]![p]!, akq = a[k]![q]!;
        a[k]![p] = c * akp - sn * akq; a[k]![q] = sn * akp + c * akq;
      }
      for (let k = 0; k < 3; k++) {
        const apk = a[p]![k]!, aqk = a[q]![k]!;
        a[p]![k] = c * apk - sn * aqk; a[q]![k] = sn * apk + c * aqk;
      }
      for (let k = 0; k < 3; k++) {
        const vkp = v[k]![p]!, vkq = v[k]![q]!;
        v[k]![p] = c * vkp - sn * vkq; v[k]![q] = sn * vkp + c * vkq;
      }
    }
  }
  let best = 0;
  for (let i = 1; i < 3; i++) if (a[i]![i]! < a[best]![best]!) best = i;
  return new Vector3(v[0]![best]!, v[1]![best]!, v[2]![best]!).normalize();
}

/**
 * Curved wall under the click (hole wall, cylinder, fillet): grows a smooth patch
 * (neighbouring faces within 30°), finds the axis the normals are all perpendicular
 * to, and fits a circle to the patch seen along that axis. Null when it is not a
 * clean cylindrical surface.
 */
export function fitCylinder(o: SceneObject, tri: number): WorldFeature | null {
  const { neighbors, normals } = adjacency(o.geometry);
  const pos = o.geometry.getAttribute('position').array as Float32Array;
  const cosLim = Math.cos((30 * Math.PI) / 180);
  const seen = new Set<number>([tri]);
  const stack = [tri];
  const patch: number[] = [];
  while (stack.length && patch.length < 6000) {
    const t = stack.pop()!;
    patch.push(t);
    for (let k = 0; k < 3; k++) {
      const u = neighbors[t * 3 + k]!;
      if (u < 0 || seen.has(u)) continue;
      const d = normals[t * 3]! * normals[u * 3]! + normals[t * 3 + 1]! * normals[u * 3 + 1]! + normals[t * 3 + 2]! * normals[u * 3 + 2]!;
      if (d < cosLim || d > 0.999999) {
        if (d > 0.999999) { seen.add(u); stack.push(u); } // coplanar strips belong to the same wall
        continue;
      }
      seen.add(u);
      stack.push(u);
    }
  }
  if (patch.length < 6) return null;
  const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  let spread = 1;
  const n0 = new Vector3(normals[tri * 3]!, normals[tri * 3 + 1]!, normals[tri * 3 + 2]!);
  for (const t of patch) {
    const n = [normals[t * 3]!, normals[t * 3 + 1]!, normals[t * 3 + 2]!];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) M[i]![j]! += n[i]! * n[j]!;
    spread = Math.min(spread, n0.x * n[0]! + n0.y * n[1]! + n0.z * n[2]!);
  }
  if (spread > Math.cos((15 * Math.PI) / 180)) return null; // too flat to be a curved wall
  const axis = smallestEigenvector(M);
  for (const t of patch) if (Math.abs(normals[t * 3]! * axis.x + normals[t * 3 + 1]! * axis.y + normals[t * 3 + 2]! * axis.z) > 0.08) return null;
  // 2D frame perpendicular to the axis; Kåsa least-squares circle through the patch vertices
  const u = new Vector3(1, 0, 0).cross(axis);
  if (u.lengthSq() < 1e-6) u.set(0, 1, 0).cross(axis);
  u.normalize();
  const w = axis.clone().cross(u);
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sz = 0, sxz = 0, syz = 0, n = 0, lo = Infinity, hi = -Infinity;
  for (const t of patch) for (let k = 0; k < 3; k++) {
    const vx = pos[t * 9 + k * 3]!, vy = pos[t * 9 + k * 3 + 1]!, vz = pos[t * 9 + k * 3 + 2]!;
    const x = vx * u.x + vy * u.y + vz * u.z, y = vx * w.x + vy * w.y + vz * w.z, h = vx * axis.x + vy * axis.y + vz * axis.z;
    const z = x * x + y * y;
    sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sz += z; sxz += x * z; syz += y * z; n++;
    lo = Math.min(lo, h); hi = Math.max(hi, h);
  }
  // solve [sxx sxy sx; sxy syy sy; sx sy n] [a b c] = [sxz syz sz]; centre = (a/2, b/2), r² = c + cx² + cy²
  const A = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]], B = [sxz, syz, sz];
  const det3 = (m: number[][]) => m[0]![0]! * (m[1]![1]! * m[2]![2]! - m[1]![2]! * m[2]![1]!) - m[0]![1]! * (m[1]![0]! * m[2]![2]! - m[1]![2]! * m[2]![0]!) + m[0]![2]! * (m[1]![0]! * m[2]![1]! - m[1]![1]! * m[2]![0]!);
  const D = det3(A);
  if (Math.abs(D) < 1e-12) return null;
  const col = (i: number) => A.map((r, k) => r.map((v, j) => (j === i ? B[k]! : v)));
  const a = det3(col(0)) / D, b = det3(col(1)) / D, c = det3(col(2)) / D;
  const cx = a / 2, cy = b / 2, r = Math.sqrt(Math.max(0, c + cx * cx + cy * cy));
  if (!(r > 0)) return null;
  // residual check: every patch vertex within 2 % of r (plus a hair for facets)
  for (const t of patch) for (let k = 0; k < 3; k++) {
    const vx = pos[t * 9 + k * 3]!, vy = pos[t * 9 + k * 3 + 1]!, vz = pos[t * 9 + k * 3 + 2]!;
    const x = vx * u.x + vy * u.y + vz * u.z, y = vx * w.x + vy * w.y + vz * w.z;
    if (Math.abs(Math.hypot(x - cx, y - cy) - r) > r * 0.03 + 0.02) return null;
  }
  const mid = (lo + hi) / 2;
  const centre = u.clone().multiplyScalar(cx).addScaledVector(w, cy).addScaledVector(axis, mid);
  const local: SurfaceFeature = { type: 'circle', center: centre.toArray() as V3, normal: axis.toArray() as V3, radius: r };
  const world = toWorld(local, o);
  return { ...world, cylinder: { length: (hi - lo) * objScale(o) } };
}

/** Snapped point for point-to-point measuring: corner, edge midpoint, hole centre, edge or surface. */
export function snapPoint(o: SceneObject, tri: number, point: Vector3, limit: number, snapPoints = true, snapCentres = true): WorldFeature {
  const f = pickFeature(o, tri, point, { limit, snapPoints });
  if (f?.type === 'point') return f;
  if (f?.type === 'edge') {
    const p = closestOnSegment(point, new Vector3(...f.a), new Vector3(...f.b));
    return { objectId: o.id, type: 'point', p: p.toArray() as V3, snap: 'edge' };
  }
  if (f?.type === 'circle' && snapCentres) return { objectId: o.id, type: 'point', p: f.center, snap: 'centre' };
  return { objectId: o.id, type: 'point', p: point.toArray() as V3, snap: 'surface' };
}

/** Circle centre as a point feature. */
export const centreOf = (c: WorldFeature & { type: 'circle' }): WorldFeature => ({ objectId: c.objectId, type: 'point', p: c.center, snap: 'centre' });

// ---------------------------------------------------------------- measurement maths

const v = (a: V3) => new Vector3(...a);
const PARALLEL = 0.5; // degrees

export interface AngleArc {
  center: V3;
  /** Unit directions of the two arms. */
  u: V3;
  w: V3;
  radius: number;
}

export interface MeasureResult {
  /** Labelled lines for the panel (first ones are the headline values). */
  rows: Array<[string, string]>;
  /** Segment to draw (the headline distance). */
  segment?: [V3, V3];
  distance?: number;
  angle?: number;
  arc?: AngleArc;
}

export function closestOnSegment(p: Vector3, a: Vector3, b: Vector3): Vector3 {
  const d = b.clone().sub(a);
  const t = Math.max(0, Math.min(1, p.clone().sub(a).dot(d) / (d.lengthSq() || 1)));
  return a.clone().addScaledVector(d, t);
}

function closestOnLine(p: Vector3, a: Vector3, b: Vector3): Vector3 {
  const d = b.clone().sub(a);
  return a.clone().addScaledVector(d, p.clone().sub(a).dot(d) / (d.lengthSq() || 1));
}

/** Closest points between two segments (clamped). */
function segmentSegment(a0: Vector3, a1: Vector3, b0: Vector3, b1: Vector3): [Vector3, Vector3] {
  const d1 = a1.clone().sub(a0), d2 = b1.clone().sub(b0), r = a0.clone().sub(b0);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r);
  let s: number, t: number;
  if (a <= 1e-12 && e <= 1e-12) return [a0.clone(), b0.clone()];
  if (a <= 1e-12) { s = 0; t = Math.max(0, Math.min(1, f / e)); }
  else {
    const c = d1.dot(r);
    if (e <= 1e-12) { t = 0; s = Math.max(0, Math.min(1, -c / a)); }
    else {
      const b = d1.dot(d2), den = a * e - b * b;
      s = den > 1e-12 ? Math.max(0, Math.min(1, (b * f - c * e) / den)) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c / a)); }
      else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b - c) / a)); }
    }
  }
  return [a0.clone().addScaledVector(d1, s), b0.clone().addScaledVector(d2, t)];
}

/** Closest points between two infinite lines (null when parallel). */
function lineLine(a0: Vector3, d1: Vector3, b0: Vector3, d2: Vector3): [Vector3, Vector3] | null {
  const r = a0.clone().sub(b0);
  const a = d1.dot(d1), b = d1.dot(d2), c = d1.dot(r), e = d2.dot(d2), f = d2.dot(r);
  const den = a * e - b * b;
  if (Math.abs(den) < 1e-12) return null;
  const s = (b * f - c * e) / den, t = (a * f - b * c) / den;
  return [a0.clone().addScaledVector(d1, s), b0.clone().addScaledVector(d2, t)];
}

/** Closest point on a circle (ring) to p. */
function closestOnCircle(p: Vector3, c: Vector3, n: Vector3, r: number): Vector3 {
  const d = p.clone().sub(c);
  d.addScaledVector(n, -d.dot(n));
  if (d.lengthSq() < 1e-18) {
    d.set(1, 0, 0).cross(n);
    if (d.lengthSq() < 1e-9) d.set(0, 1, 0).cross(n);
  }
  return c.clone().addScaledVector(d.normalize(), r);
}

const deg = (r: number) => (r * 180) / Math.PI;
const angleBetween = (a: Vector3, b: Vector3) => deg(Math.acos(Math.max(-1, Math.min(1, a.clone().normalize().dot(b.clone().normalize())))));
/** Angle between two lines (0…90°). */
const lineAngle = (a: Vector3, b: Vector3) => { const x = angleBetween(a, b); return x > 90 ? 180 - x : x; };

const V3of = (x: Vector3) => x.toArray() as V3;

/** Description of a single feature (the panel rows for one pick / hover). */
export function describe(f: WorldFeature, fmt: (mm: number) => string): Array<[string, string]> {
  const xyz = (p: V3) => p.map((c) => fmt(c)).join(', ');
  if (f.type === 'point') return [['Point', xyz(f.p)]];
  if (f.type === 'edge') {
    const rows: Array<[string, string]> = [['Length', fmt(v(f.a).distanceTo(v(f.b)))]];
    if (f.center) rows.push(['Polygon centre', xyz(f.center)]);
    return rows;
  }
  if (f.type === 'circle' && f.cylinder) return [['Diameter', fmt(f.radius * 2)], ['Radius', fmt(f.radius)], ['Wall length', fmt(f.cylinder.length)], ['Axis', f.normal.map((c) => c.toFixed(3)).join(', ')]];
  if (f.type === 'circle') return [['Diameter', fmt(f.radius * 2)], ['Radius', fmt(f.radius)], ['Centre', xyz(f.center)]];
  const rows: Array<[string, string]> = [['Normal', f.normal.map((c) => c.toFixed(3)).join(', ')]];
  if (f.area != null) rows.unshift(['Area', `${(f.area / 100).toFixed(2)} cm²`]);
  return rows;
}

/** One-line label for a hovered feature. */
export function hoverLabel(f: WorldFeature, fmt: (mm: number) => string): string {
  if (f.type === 'point') return f.snap === 'midpoint' ? 'Edge midpoint' : f.snap === 'centre' ? 'Centre' : f.snap === 'surface' ? 'Point' : 'Corner';
  if (f.type === 'edge') return `Edge ${fmt(v(f.a).distanceTo(v(f.b)))}`;
  if (f.type === 'circle') return `${f.cylinder ? 'Curved wall ' : ''}Ø ${fmt(f.radius * 2)} · R ${fmt(f.radius)}`;
  return `Face${f.area != null ? ` ${(f.area / 100).toFixed(2)} cm²` : ''}`;
}

/** Distances and angles between two features (Bambu Studio / PrusaSlicer pairs). */
export function measure(A: WorldFeature, B: WorldFeature, fmt: (mm: number) => string): MeasureResult {
  const rank = { point: 0, edge: 1, circle: 2, plane: 3 } as const;
  const [a, b] = rank[A.type] <= rank[B.type] ? [A, B] : [B, A];
  const out: MeasureResult = { rows: [] };
  const deltas = (p: Vector3, q: Vector3) => {
    const d = q.clone().sub(p);
    out.rows.push(['Distance X / Y / Z', [d.x, d.y, d.z].map((c) => fmt(Math.abs(c))).join(' / ')]);
  };
  /** Headline distance: draws the segment. */
  const seg = (p: Vector3, q: Vector3, label: string, xyz = true) => {
    if (out.segment === undefined) {
      out.segment = [V3of(p), V3of(q)];
      out.distance = p.distanceTo(q);
    }
    out.rows.push([label, fmt(p.distanceTo(q))]);
    if (xyz) deltas(p, q);
  };
  const extra = (label: string, d: number) => out.rows.push([label, fmt(d)]);
  const ang = (x: number, arc?: AngleArc) => {
    out.angle = x;
    out.rows.unshift(['Angle', `${x.toFixed(2)}°`]);
    if (arc && arc.radius > 0) out.arc = arc;
  };
  const arcAt = (center: Vector3, u: Vector3, w: Vector3, radius: number): AngleArc => ({ center: V3of(center), u: V3of(u.clone().normalize()), w: V3of(w.clone().normalize()), radius });
  /** Arm direction from `c` towards the far end of a segment. */
  const arm = (c: Vector3, p0: Vector3, p1: Vector3) => (p0.distanceTo(c) > p1.distanceTo(c) ? p0.clone().sub(c) : p1.clone().sub(c));

  if (a.type === 'point') {
    const p = v(a.p);
    if (b.type === 'point') seg(p, v(b.p), 'Distance');
    else if (b.type === 'edge') {
      const line = closestOnLine(p, v(b.a), v(b.b));
      const onSeg = closestOnSegment(p, v(b.a), v(b.b));
      seg(p, line, 'Distance to edge line');
      if (onSeg.distanceTo(line) > 1e-6) extra('Direct distance', p.distanceTo(onSeg));
    } else if (b.type === 'circle') {
      seg(p, v(b.center), 'Distance to centre');
      extra('Distance to circle', p.distanceTo(closestOnCircle(p, v(b.center), v(b.normal), b.radius)));
    } else {
      const n = v(b.normal), d = p.clone().sub(v(b.origin)).dot(n);
      seg(p, p.clone().addScaledVector(n, -d), 'Distance to face');
    }
  } else if (a.type === 'edge') {
    const a0 = v(a.a), a1 = v(a.b), da = a1.clone().sub(a0);
    if (b.type === 'edge') {
      const b0 = v(b.a), b1 = v(b.b), db = b1.clone().sub(b0);
      const x = lineAngle(da, db);
      if (x < PARALLEL) {
        seg(a0, closestOnLine(a0, b0, b1), 'Distance (parallel)');
        ang(0);
      } else {
        const ll = lineLine(a0, da, b0, db)!;
        const c = ll[0].clone().add(ll[1]).multiplyScalar(0.5);
        const r = Math.min(da.length(), db.length()) / 3;
        ang(angleBetween(arm(c, a0, a1), arm(c, b0, b1)), arcAt(c, arm(c, a0, a1), arm(c, b0, b1), r));
        if (ll[0].distanceTo(ll[1]) > 1e-4) extra('Skew distance (lines)', ll[0].distanceTo(ll[1]));
      }
      const [p, q] = segmentSegment(a0, a1, b0, b1);
      if (x < PARALLEL || p.distanceTo(q) < 1e-6) extra('Direct distance', p.distanceTo(q));
      else seg(p, q, 'Direct distance');
    } else if (b.type === 'circle') {
      const c = v(b.center), n = v(b.normal);
      const x = 90 - lineAngle(da, n);
      ang(x);
      seg(closestOnLine(c, a0, a1), c, 'Edge line to centre');
      const [p, q] = segmentSegment(a0, a1, c, c);
      extra('Direct distance to centre', p.distanceTo(q));
    } else if (b.type === 'plane') {
      const n = v(b.normal), o = v(b.origin);
      const x = 90 - lineAngle(da, n);
      const d0 = a0.clone().sub(o).dot(n), d1 = a1.clone().sub(o).dot(n);
      if (x < PARALLEL) {
        ang(0);
        seg(a0, a0.clone().addScaledVector(n, -d0), 'Distance (parallel)');
      } else {
        // where the edge line meets the plane
        const t = d0 / (d0 - d1);
        const c = a0.clone().addScaledVector(da, t);
        const u = arm(c, a0, a1);
        const proj = u.clone().addScaledVector(n, -u.dot(n));
        ang(x, arcAt(c, u, proj, da.length() / 3));
        const near = Math.abs(d0) < Math.abs(d1) ? a0 : a1, dn = Math.abs(d0) < Math.abs(d1) ? d0 : d1;
        if (d0 * d1 > 0) seg(near, near.clone().addScaledVector(n, -dn), 'Nearest end to face');
      }
    }
  } else if (a.type === 'circle') {
    const c = v(a.center), n1 = v(a.normal);
    if (b.type === 'circle') {
      const c2 = v(b.center), n2 = v(b.normal);
      const x = lineAngle(n1, n2);
      seg(c, c2, 'Centre distance');
      if (x < PARALLEL) {
        const axial = Math.abs(c2.clone().sub(c).dot(n1));
        extra('Axial distance', axial);
        extra('Radial offset (concentricity)', Math.sqrt(Math.max(0, c.distanceToSquared(c2) - axial * axial)));
      }
      ang(x);
      out.rows.push(['Diameters', `${fmt(a.radius * 2)} / ${fmt(b.radius * 2)}`]);
    } else if (b.type === 'plane') {
      const n = v(b.normal), o = v(b.origin);
      const x = lineAngle(n1, n);
      ang(x);
      const d = c.clone().sub(o).dot(n);
      seg(c, c.clone().addScaledVector(n, -d), 'Centre to face');
    }
  } else if (a.type === 'plane' && b.type === 'plane') {
    const n1 = v(a.normal), n2 = v(b.normal);
    const x = angleBetween(n1, n2);
    if (x < PARALLEL || x > 180 - PARALLEL) {
      const o = v(a.origin), d = v(b.origin).sub(o).dot(n1);
      ang(0);
      seg(o, o.clone().addScaledVector(n1, d), 'Distance (parallel)');
    } else {
      // dihedral angle between the faces, drawn on the line where the planes meet
      const dir = n1.clone().cross(n2).normalize();
      const o1 = v(a.origin), o2 = v(b.origin);
      // point on both planes closest to the midpoint of the origins
      const m = o1.clone().add(o2).multiplyScalar(0.5);
      const d1 = n1.dot(o1), d2 = n2.dot(o2);
      const nn = n1.dot(n2);
      const k1 = (d1 - d2 * nn) / (1 - nn * nn), k2 = (d2 - d1 * nn) / (1 - nn * nn);
      const onLine = n1.clone().multiplyScalar(k1).add(n2.clone().multiplyScalar(k2));
      const c = onLine.clone().addScaledVector(dir, m.clone().sub(onLine).dot(dir));
      const u1 = o1.clone().sub(c); u1.addScaledVector(dir, -u1.dot(dir));
      const u2 = o2.clone().sub(c); u2.addScaledVector(dir, -u2.dot(dir));
      const r = Math.min(u1.length(), u2.length()) * 0.6;
      ang(u1.lengthSq() > 1e-12 && u2.lengthSq() > 1e-12 ? angleBetween(u1, u2) : 180 - x, r > 0 ? arcAt(c, u1, u2, r) : undefined);
    }
  }
  return out;
}

// ---------------------------------------------------------------- tool state

interface MeasureState {
  mode: 'points' | 'features';
  /** Snap to corners, edge midpoints and edges (points mode) / corners and midpoints (features mode). */
  snap: boolean;
  /** Offer hole / circle centres. */
  snapCentres: boolean;
  picks: WorldFeature[];
  hover: WorldFeature | null;
  set: (patch: Partial<Pick<MeasureState, 'mode' | 'picks' | 'hover' | 'snap' | 'snapCentres'>>) => void;
}

export const useMeasureStore = create<MeasureState>()((set) => ({
  mode: 'features',
  snap: true,
  snapCentres: true,
  picks: [],
  hover: null,
  set: (patch) => set(patch),
}));

/** Test/automation hook: world point → client pixel position in the viewport (set while the tool is active). */
export const measureViewport: { project: ((p: V3) => [number, number]) | null } = { project: null };
