// Builds the surface table a flat shape is mapped through (see geometry/wrapLookup):
//  - "wrap":    like a sticker. The baseline walks along the surface (around rounded
//               corners, cylinders, tapered walls) keeping true lengths; each column
//               then follows the surface "up" the same way.
//  - "project": like a light projector. Every point moves straight along the click
//               normal onto the surface (the original behaviour; curved parts stretch).
import { Matrix3, Ray, Vector3, type BufferGeometry } from 'three';
import type { MeshBVH } from 'three-mesh-bvh';
import { ensureBoundsTree, objectMatrix } from '../../scene/geometry';
import type { SceneObject } from '../../scene/types';
import { surfaceFrame, type V3, type WrapTable } from '../../geometry/wrapLookup';

interface Surface {
  /** Closest surface point (world) and its outward normal. */
  closest(p: Vector3): { p: Vector3; n: Vector3 } | null;
  /** Hit along a world ray (both directions), nearest to the origin. */
  along(o: Vector3, d: Vector3): Vector3 | null;
}

function surfaceOf(o: SceneObject): Surface {
  const g = o.geometry as BufferGeometry & { boundsTree: MeshBVH };
  ensureBoundsTree(g);
  const bvh = g.boundsTree;
  const m = objectMatrix(o);
  const inv = m.clone().invert();
  const nm = new Matrix3().getNormalMatrix(m);
  const pos = g.getAttribute('position');
  const index = g.getIndex();
  const a = new Vector3(), b = new Vector3(), c = new Vector3();
  const faceNormal = (tri: number) => {
    const ia = index ? index.getX(tri * 3) : tri * 3, ib = index ? index.getX(tri * 3 + 1) : tri * 3 + 1, ic = index ? index.getX(tri * 3 + 2) : tri * 3 + 2;
    a.fromBufferAttribute(pos, ia); b.fromBufferAttribute(pos, ib); c.fromBufferAttribute(pos, ic);
    return b.sub(a).cross(c.sub(a)).applyMatrix3(nm).normalize().clone();
  };
  const local = new Vector3();
  const target = { point: new Vector3(), distance: 0, faceIndex: 0 };
  return {
    closest(p) {
      local.copy(p).applyMatrix4(inv);
      const hit = bvh.closestPointToPoint(local, target as never) as typeof target | null;
      if (!hit) return null;
      return { p: hit.point.clone().applyMatrix4(m), n: faceNormal(hit.faceIndex) };
    },
    along(o0, d) {
      const lo = o0.clone().applyMatrix4(inv);
      const ld = d.clone().transformDirection(inv);
      let best: Vector3 | null = null, bestT = Infinity;
      for (const dir of [ld, ld.clone().negate()]) {
        const h = bvh.raycastFirst(new Ray(lo, dir), 2 /* DoubleSide */ as never) as { point: Vector3 } | null;
        if (!h) continue;
        const w = h.point.clone().applyMatrix4(m);
        const t = w.distanceTo(o0);
        if (t < bestT) { bestT = t; best = w; }
      }
      return best;
    },
  };
}

/** Grid spacing for a shape of the given half sizes. */
export function wrapStep(hx: number, hy: number): number {
  return Math.max(0.15, Math.min(1, Math.max(hx, hy) / 40));
}

/**
 * Table for a shape spanning x ∈ [-hx, hx], y ∈ [-hy, hy] (shape frame), placed at
 * `point` with `normal`, text "up" following world +Z, turned by `rotation`.
 */
export function buildWrapTable(o: SceneObject, mode: 'wrap' | 'project', point: V3, normal: V3, rotation: number, hx: number, hy: number): WrapTable {
  const surf = surfaceOf(o);
  const fr = surfaceFrame(normal, [0, 0, 1], rotation);
  const fx = new Vector3(...fr[0]), fy = new Vector3(...fr[1]), fn = new Vector3(...fr[2]);
  const h = wrapStep(hx, hy);
  const ex = hx * 1.08 + h, ey = hy * 1.08 + h;
  const nx = Math.max(2, Math.min(400, Math.ceil((2 * ex) / h) + 1));
  const ny = Math.max(2, Math.min(400, Math.ceil((2 * ey) / h) + 1));
  const dx = (2 * ex) / (nx - 1), dy = (2 * ey) / (ny - 1);
  const S = new Float32Array(nx * ny * 3), N = new Float32Array(nx * ny * 3);
  const P0 = new Vector3(...point);

  if (mode === 'project') {
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = -ex + i * dx, y = -ey + j * dy;
      const q = P0.clone().addScaledVector(fx, x).addScaledVector(fy, y);
      const hit = surf.along(q, fn) ?? q;
      S.set(hit.toArray(), (j * nx + i) * 3);
      N.set(fn.toArray(), (j * nx + i) * 3);
    }
    return { x0: -ex, dx, nx, y0: -ey, dy, ny, S, N };
  }

  // 1) baseline: walk along the surface in ±x, recording arc length
  interface Station { s: number; p: Vector3; n: Vector3; u: Vector3 }
  const start = surf.closest(P0);
  const n0 = start ? start.n.clone() : fn.clone();
  if (n0.dot(fn) < 0) n0.negate();
  const walk = (sign: 1 | -1): Station[] => {
    const out: Station[] = [];
    let p = start ? start.p.clone() : P0.clone(), n = n0.clone(), u = fy.clone(), s = 0;
    let t = fx.clone().multiplyScalar(sign);
    const step = h * 0.5;
    for (let k = 0; k < 4000 && s < ex + h; k++) {
      const c = surf.closest(p.clone().addScaledVector(t, step));
      if (!c) break;
      const moved = c.p.distanceTo(p);
      if (moved < step * 0.05) {
        // stuck (inside corner): keep going straight in the tangent plane
        p.addScaledVector(t, step); s += step;
      } else { s += moved; p = c.p; }
      const cn = c.n.dot(n) < -0.2 ? n.clone() : c.n; // ignore jumps to a back face
      // keep the text's "up" in the new tangent plane; travel direction follows
      const nu = u.clone().addScaledVector(cn, -u.dot(cn));
      if (nu.lengthSq() > 1e-8) u = nu.normalize();
      const nt = new Vector3().crossVectors(u, cn).multiplyScalar(sign);
      if (nt.lengthSq() > 1e-8) t = nt.normalize();
      n = cn;
      out.push({ s: s * sign, p: p.clone(), n: n.clone(), u: u.clone() });
    }
    return out;
  };
  const base: Station = { s: 0, p: start ? start.p.clone() : P0.clone(), n: n0, u: fy.clone().addScaledVector(n0, -fy.dot(n0)).normalize() };
  const stations = [...walk(-1).reverse(), base, ...walk(1)];
  const at = (x: number): Station => {
    let k = 0;
    while (k < stations.length - 2 && stations[k + 1]!.s < x) k++;
    const A = stations[k]!, B = stations[k + 1] ?? A;
    const span = B.s - A.s;
    const w = span > 1e-9 ? Math.max(0, Math.min(1, (x - A.s) / span)) : 0;
    const p = A.p.clone().lerp(B.p, w);
    if (x < stations[0]!.s) p.addScaledVector(new Vector3().crossVectors(A.u, A.n).normalize(), x - stations[0]!.s);
    const last = stations[stations.length - 1]!;
    if (x > last.s) p.addScaledVector(new Vector3().crossVectors(last.u, last.n).normalize(), x - last.s);
    return { s: x, p, n: A.n.clone().lerp(B.n, w).normalize(), u: A.u.clone().lerp(B.u, w).normalize() };
  };

  // 2) each column climbs the surface along its local "up" the same way
  for (let i = 0; i < nx; i++) {
    const col = at(-ex + i * dx);
    const j0 = Math.round(ey / dy);
    const put = (j: number, p: Vector3, n: Vector3) => { S.set(p.toArray(), (j * nx + i) * 3); N.set(n.toArray(), (j * nx + i) * 3); };
    put(j0, col.p, col.n);
    for (const sign of [1, -1] as const) {
      let p = col.p.clone(), u = col.u.clone().multiplyScalar(sign), n = col.n.clone();
      for (let j = j0 + sign; j >= 0 && j < ny; j += sign) {
        const c = surf.closest(p.clone().addScaledVector(u, dy));
        if (c && c.n.dot(n) > -0.2 && c.p.distanceTo(p) > dy * 0.3) {
          p = c.p; n = c.n;
          const nu = u.clone().addScaledVector(n, -u.dot(n));
          if (nu.lengthSq() > 1e-8) u = nu.normalize();
        } else p = p.clone().addScaledVector(u, dy);
        put(j, p, n);
      }
    }
  }
  // soften faceted normals (3×3 blur) so the depth offset follows the curve smoothly
  const Nb = new Float32Array(N.length);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    let sx = 0, sy = 0, sz = 0;
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
      const ii = Math.max(0, Math.min(nx - 1, i + a)), jj = Math.max(0, Math.min(ny - 1, j + b));
      const q = (jj * nx + ii) * 3;
      sx += N[q]!; sy += N[q + 1]!; sz += N[q + 2]!;
    }
    const l = Math.hypot(sx, sy, sz) || 1;
    Nb.set([sx / l, sy / l, sz / l], (j * nx + i) * 3);
  }
  return { x0: -ex, dx, nx, y0: -ey, dy, ny, S, N: Nb };
}

/** Splits soup triangles until no edge is longer than `maxEdge` (so mapped edges bend with the surface). */
export function refineSoup(positions: Float32Array, maxEdge: number, maxTris = 300_000): Float32Array {
  const out: number[] = [];
  const stack: number[][] = [];
  for (let i = 0; i < positions.length; i += 9) stack.push(Array.from(positions.subarray(i, i + 9)));
  const lim2 = maxEdge * maxEdge;
  while (stack.length) {
    const t = stack.pop()!;
    const d = (a: number, b: number) => (t[a]! - t[b]!) ** 2 + (t[a + 1]! - t[b + 1]!) ** 2 + (t[a + 2]! - t[b + 2]!) ** 2;
    const e = [d(0, 3), d(3, 6), d(6, 0)];
    const k = e.indexOf(Math.max(...e));
    if (e[k]! <= lim2 || out.length / 9 + stack.length >= maxTris) { out.push(...t); continue; }
    const v = [t.slice(0, 3), t.slice(3, 6), t.slice(6, 9)];
    const a = v[k]!, b = v[(k + 1) % 3]!, c = v[(k + 2) % 3]!;
    const m = [(a[0]! + b[0]!) / 2, (a[1]! + b[1]!) / 2, (a[2]! + b[2]!) / 2];
    stack.push([...a, ...m, ...c], [...m, ...b, ...c]);
  }
  return new Float32Array(out);
}

