// Ported from Bambu Studio — src/libslic3r/Measure.cpp (MeasuringImpl::update_planes,
// MeasuringImpl::extract_features, MeasuringImpl::get_feature, get_center_and_radius)
// and src/libslic3r/Geometry/Circle.cpp (circle_ransac, circle_center) @ da8b44e
// Original licence: AGPL-3.0 (https://github.com/bambulab/BambuStudio). Translated to TypeScript for Mesh Studio.
// Changes: works on a welded triangle soup with an edge-neighbour array instead of
// indexed_triangle_set + SurfaceMesh; plane borders are chained from directed
// border edges instead of walking half-edges; RANSAC samples deterministically
// (evenly spaced triples) instead of std::sample with mt19937; the hover limit
// is a parameter (Mesh Studio passes a few screen pixels in mesh units); edge-end
// snapping can be switched off.

export type V3 = [number, number, number];

export type SurfaceFeature =
  | { type: 'point'; p: V3 }
  | { type: 'edge'; a: V3; b: V3; center?: V3 }
  | { type: 'circle'; center: V3; normal: V3; radius: number }
  | { type: 'plane'; normal: V3; origin: V3; index: number };

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const sq = (a: V3) => dot(a, a);
const unit = (a: V3): V3 => { const l = norm(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const EPSILON = 1e-4;
const isApprox = (a: number, b: number, eps = EPSILON) => Math.abs(a - b) < eps;
const isApproxV = (a: V3, b: V3) => isApprox(a[0], b[0]) && isApprox(a[1], b[1]) && isApprox(a[2], b[2]);

/** Rotation taking n to +Z (as rows), and its inverse via transpose. */
function rotToZ(n: V3): [V3, V3, V3] {
  const z = unit(n);
  const ref: V3 = Math.abs(z[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const x = unit(cross(ref, z));
  const y = cross(z, x);
  return [x, y, z];
}
const apply = (r: [V3, V3, V3], p: V3): V3 => [dot(r[0], p), dot(r[1], p), dot(r[2], p)];
const applyInv = (r: [V3, V3, V3], p: V3): V3 => add(add(mul(r[0], p[0]), mul(r[1], p[1])), mul(r[2], p[2]));

function circleCenter(a: [number, number], b: [number, number], c: [number, number]): [number, number] | null {
  const ax = b[0] - a[0], ay = b[1] - a[1], bx = c[0] - a[0], by = c[1] - a[1];
  const d = 2 * (ax * by - ay * bx);
  if (Math.abs(d) < EPSILON) return null;
  const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by;
  return [a[0] + (by * a2 - ay * b2) / d, a[1] + (ax * b2 - bx * a2) / d];
}

/** circle_ransac: best of a few 3-point circles, radius = mean distance, error = max deviation. */
function circleRansac(pts: Array<[number, number]>, iterations: number): { center: [number, number]; radius: number; error: number } | null {
  if (pts.length < 3) return null;
  let best: { center: [number, number]; radius: number; error: number } | null = null;
  const n = pts.length;
  for (let it = 0; it < iterations; it++) {
    const o = Math.floor((it * n) / (iterations * 3));
    const s = [pts[o % n]!, pts[(o + Math.floor(n / 3)) % n]!, pts[(o + Math.floor((2 * n) / 3)) % n]!];
    const c = circleCenter(s[0]!, s[1]!, s[2]!);
    if (!c) continue;
    let r = 0;
    for (const p of pts) r += Math.hypot(p[0] - c[0], p[1] - c[1]);
    r /= n;
    let err = 0;
    for (const p of pts) err = Math.max(err, Math.abs(Math.hypot(p[0] - c[0], p[1] - c[1]) - r));
    if (!best || err < best.error) best = { center: c, radius: r, error: err };
  }
  return best;
}

function centerAndRadius(points: V3[], r: [V3, V3, V3]): { center: V3; radius: number; error: number } {
  let z = 0;
  const flat = points.map((p) => { const q = apply(r, p); z = q[2]; return [q[0], q[1]] as [number, number]; });
  const iter = points.length < 10 ? 2 : points.length < 100 ? 4 : 6;
  const c = circleRansac(flat, iter);
  if (!c) return { center: points[0]!, radius: 0, error: Infinity };
  return { center: applyInv(r, [c.center[0], c.center[1], z]), radius: c.radius, error: c.error };
}

interface PlaneData {
  facets: number[];
  normal: V3;
  borders: V3[][];
  features: SurfaceFeature[] | null;
}

export class Measuring {
  private faceToPlane: Int32Array;
  private planes: PlaneData[] = [];

  /**
   * `verts`/`index`: welded mesh (3 indices per triangle, same order as the soup),
   * `neighbors`: 3 neighbouring triangles per triangle (-1 = open edge).
   */
  constructor(private verts: Float32Array, private index: Uint32Array, private neighbors: Int32Array) {
    const tris = index.length / 3;
    this.faceToPlane = new Int32Array(tris).fill(-1);
    this.updatePlanes();
  }

  private vertex(i: number): V3 {
    return [this.verts[i * 3]!, this.verts[i * 3 + 1]!, this.verts[i * 3 + 2]!];
  }

  private faceNormal(t: number): V3 {
    const a = this.vertex(this.index[t * 3]!), b = this.vertex(this.index[t * 3 + 1]!), c = this.vertex(this.index[t * 3 + 2]!);
    return unit(cross(sub(b, a), sub(c, a)));
  }

  private updatePlanes() {
    const tris = this.index.length / 3;
    const normals = new Float32Array(tris * 3);
    for (let t = 0; t < tris; t++) normals.set(this.faceNormal(t), t * 3);
    const same = (a: number, b: number) =>
      Math.abs(normals[a * 3]! - normals[b * 3]!) < 0.001 && Math.abs(normals[a * 3 + 1]! - normals[b * 3 + 1]!) < 0.001 && Math.abs(normals[a * 3 + 2]! - normals[b * 3 + 2]!) < 0.001;
    const queue: number[] = [];
    for (let seed = 0; seed < tris; seed++) {
      if (this.faceToPlane[seed]! !== -1) continue;
      const id = this.planes.length;
      const plane: PlaneData = { facets: [], normal: [normals[seed * 3]!, normals[seed * 3 + 1]!, normals[seed * 3 + 2]!], borders: [], features: null };
      this.planes.push(plane);
      queue.push(seed);
      while (queue.length) {
        const f = queue.pop()!;
        if (this.faceToPlane[f] !== -1 || !same(f, seed)) continue;
        this.faceToPlane[f] = id;
        plane.facets.push(f);
        for (let j = 0; j < 3; j++) {
          const nb = this.neighbors[f * 3 + j]!;
          if (nb >= 0 && this.faceToPlane[nb] === -1) queue.push(nb);
        }
      }
    }
  }

  private buildBorders(p: number) {
    const plane = this.planes[p]!;
    const next = new Map<number, number[]>();
    for (const f of plane.facets) {
      for (let k = 0; k < 3; k++) {
        const nb = this.neighbors[f * 3 + k]!;
        if (nb < 0) { plane.borders = []; return; } // open mesh: no borders (PLANE_FAILURE)
        if (this.faceToPlane[nb] === p) continue;
        const a = this.index[f * 3 + k]!, b = this.index[f * 3 + ((k + 1) % 3)]!;
        const l = next.get(a);
        if (l) l.push(b); else next.set(a, [b]);
      }
    }
    while (next.size) {
      const start = next.keys().next().value as number;
      const loop: number[] = [start];
      let cur = start;
      for (let guard = 0; guard < 3 * plane.facets.length + 3; guard++) {
        const outs = next.get(cur);
        if (!outs?.length) break;
        const nx = outs.pop()!;
        if (!outs.length) next.delete(cur);
        if (nx === start) break;
        loop.push(nx);
        cur = nx;
      }
      if (loop.length > 1) plane.borders.push(loop.map((i) => this.vertex(i)));
    }
  }

  private extractFeatures(p: number) {
    const plane = this.planes[p]!;
    this.buildBorders(p);
    const features: SurfaceFeature[] = [];
    const normal = plane.normal;
    const r = rotToZ(normal);
    for (const border of plane.borders) {
      if (border.length <= 1) continue;
      let done = false;
      if (border.length > 4) {
        const { center, radius, error } = centerAndRadius(border, r);
        if (error < 0.05) {
          const isPolygon = border.length > 4 && border.length <= 8;
          let lengthsMatch = true;
          for (let i = 2; i < border.length; i++) {
            if (!isApprox(sq(sub(border[i]!, border[i - 1]!)), sq(sub(border[i - 1]!, border[i - 2]!)), 0.01)) { lengthsMatch = false; break; }
          }
          if (lengthsMatch && (isPolygon || border.length > 8)) {
            if (isPolygon) {
              for (let j = 0; j < border.length; j++) features.push({ type: 'edge', a: border[j === 0 ? border.length - 1 : j - 1]!, b: border[j]!, center });
            } else features.push({ type: 'circle', center, normal, radius });
            done = true;
          }
        }
      }
      if (!done) features.push(...this.circlesAndEdges(border, normal, r));
    }
    // the plane itself, at the centre of its border points
    let cog: V3 = [0, 0, 0];
    let count = 0;
    for (const b of plane.borders) for (const q of b) { cog = add(cog, q); count++; }
    if (!count) cog = this.vertex(this.index[plane.facets[0]! * 3]!);
    else cog = mul(cog, 1 / count);
    features.push({ type: 'plane', normal, origin: cog, index: p });
    plane.features = features;
    plane.borders = [];
  }

  /** A border that is not one circle: find circular runs (equal angles and lengths), the rest become edges. */
  private circlesAndEdges(border: V3[], normal: V3, r: [V3, V3, V3]): SurfaceFeature[] {
    const n = border.length;
    const same = (a: number, b: number) => isApprox(a, b, 0.01);
    const off = (i: number, o: number) => { let x = i + o; if (x >= n) x -= n; else if (x < 0) x += n; return x; };
    const angles: number[] = [], lengths: number[] = [];
    let firstDifferent = 0;
    for (let i = 0; i < n; i++) {
      const v2 = sub(border[i]!, border[i === 0 ? n - 1 : i - 1]!);
      const v1 = sub(border[i === n - 1 ? 0 : i + 1]!, border[i]!);
      let angle = Math.atan2(-dot(normal, cross(v1, v2)), -dot(v1, v2)) + Math.PI;
      if (angle > Math.PI) angle = 2 * Math.PI - angle;
      angles.push(angle);
      lengths.push(norm(v2));
      if (firstDifferent === 0 && angles.length > 1 && !same(angles[angles.length - 1]!, angles[angles.length - 2]!)) firstDifferent = angles.length - 1;
    }
    let startIdx = -1;
    let inCircle = false;
    let firstIter = true;
    const circles: SurfaceFeature[] = [];
    const circleIdx: Array<[number, number]> = [];
    let single: V3[] = [];
    let singleLen = 0;
    const firstPt = off(firstDifferent, 1);
    let i = firstPt;
    while (i !== firstPt || firstIter) {
      if (same(angles[i]!, angles[off(i, -1)]!) && i !== off(firstPt, -1) && i !== startIdx) {
        if (!inCircle) {
          inCircle = true;
          startIdx = off(i, -2);
          single = [border[startIdx]!, border[off(startIdx, 1)]!];
          singleLen = lengths[off(i, -1)]!;
        }
        single.push(border[i]!);
        singleLen += lengths[i]!;
      } else {
        if (inCircle && single.length >= 5) {
          single.push(border[i]!);
          singleLen += lengths[i]!;
          let accept = true;
          for (let j = off(startIdx, 3); j !== i; j = off(j, 1)) {
            if (!same(lengths[off(j, -1)]!, lengths[j]!)) { accept = false; break; }
          }
          if (accept) {
            const { center, radius, error } = centerAndRadius(single, r);
            accept = error < 0.05 && singleLen / radius > (0.9 * Math.PI) / 2;
            if (accept) {
              circleIdx.push([startIdx, i]);
              circles.push({ type: 'circle', center, normal, radius });
            }
          }
        }
        inCircle = false;
      }
      firstIter = false;
      i = off(i, 1);
    }
    let edges: Array<{ a: V3; b: V3 }> = [];
    if (!circleIdx.length) {
      for (let k = 1; k < n; k++) edges.push({ a: border[k - 1]!, b: border[k]! });
      edges.push({ a: border[0]!, b: border[n - 1]! });
    } else if (circleIdx.length > 1 || circleIdx[0]![0] !== circleIdx[0]![1]) {
      let k = circleIdx[0]![1];
      let c = 1;
      for (let guard = 0; guard < 2 * n + 2; guard++) {
        k = off(k, 1);
        edges.push({ a: border[off(k, -1)]!, b: border[k]! });
        if (c < circleIdx.length && k === circleIdx[c]![0]) { k = circleIdx[c]![1]; c++; }
        if (k === circleIdx[0]![0]) break;
      }
    }
    // merge collinear neighbours
    for (let k = edges.length - 1; k >= 0 && edges.length > 1; k--) {
      const pi = k === 0 ? edges.length - 1 : k - 1;
      const f = edges[pi]!, s = edges[k]!;
      if (isApproxV(f.b, s.a) && isApprox(dot(unit(sub(f.b, f.a)), unit(sub(s.b, s.a))), 1)) {
        edges[pi] = { a: f.a, b: s.b };
        edges.splice(k, 1);
      }
    }
    edges = edges.filter((e) => sq(sub(e.b, e.a)) > 0);
    return [...circles, ...edges.map((e) => ({ type: 'edge' as const, a: e.a, b: e.b }))];
  }

  /** Feature of triangle `face` nearest to `point` (within `limit`), else its plane. Edge ends snap to points. */
  getFeature(face: number, point: V3, limit = 0.5, onlyPlane = false, snapEnds = true): SurfaceFeature | null {
    const p = this.faceToPlane[face];
    if (p === undefined || p < 0) return null;
    const plane = this.planes[p]!;
    if (!plane.features) this.extractFeatures(p);
    const fs = plane.features!;
    if (!onlyPlane) {
      let best = -1, bestD = Infinity;
      for (let i = 0; i < fs.length - 1; i++) {
        const d = distanceToFeature(fs[i]!, point);
        if (d < limit && d < bestD) { bestD = d; best = i; }
      }
      if (best >= 0) {
        const f = fs[best]!;
        if (f.type === 'edge' && snapEnds) {
          const lenSq = sq(sub(f.b, f.a));
          const lim = Math.max(0.025 * 0.025, Math.min(0.5 * 0.5, 0.01 * lenSq), (limit * limit) / 4);
          if (sq(sub(point, f.a)) < lim) return { type: 'point', p: f.a };
          if (sq(sub(point, f.b)) < lim) return { type: 'point', p: f.b };
        }
        return f;
      }
    }
    return fs[fs.length - 1]!;
  }

  planeTriangles(feature: SurfaceFeature): number[] {
    return feature.type === 'plane' ? this.planes[feature.index]?.facets ?? [] : [];
  }
}

/** Distance from a point to a feature (edge segment, circle ring, plane, point). */
export function distanceToFeature(f: SurfaceFeature, p: V3): number {
  if (f.type === 'point') return norm(sub(p, f.p));
  if (f.type === 'edge') {
    const d = sub(f.b, f.a);
    const t = Math.max(0, Math.min(1, dot(sub(p, f.a), d) / (sq(d) || 1)));
    return norm(sub(p, add(f.a, mul(d, t))));
  }
  if (f.type === 'circle') {
    const v = sub(p, f.center);
    const h = dot(v, f.normal);
    const inPlane = sub(v, mul(f.normal, h));
    const radial = norm(inPlane) - f.radius;
    return Math.hypot(h, radial);
  }
  return Math.abs(dot(sub(p, f.origin), f.normal));
}
