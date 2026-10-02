import { Matrix4, Quaternion, Vector3 } from 'three';
import { droppedToGrid, useSceneStore, withWorldTransform } from '../../store/useSceneStore';
import { objectMatrix, worldBox } from '../../scene/geometry';
import type { SceneObject } from '../../scene/types';

/** Rotates `o` so world direction `n` points straight down (about its bbox centre), then drops it. */
export function faceDown(o: SceneObject, n: Vector3): SceneObject {
  const q = new Quaternion().setFromUnitVectors(n.clone().normalize(), new Vector3(0, 0, -1));
  const c = worldBox(o).getCenter(new Vector3());
  const m = new Matrix4().makeTranslation(c.x, c.y, c.z).multiply(new Matrix4().makeRotationFromQuaternion(q)).multiply(new Matrix4().makeTranslation(-c.x, -c.y, -c.z));
  return droppedToGrid({ ...o, ...withWorldTransform(o, m) });
}

/** World-space normal of an original triangle. */
export function worldFaceNormal(o: SceneObject, tri: number): Vector3 {
  const p = o.geometry.getAttribute('position').array as Float32Array;
  const v = (k: number) => new Vector3(p[tri * 9 + k * 3]!, p[tri * 9 + k * 3 + 1]!, p[tri * 9 + k * 3 + 2]!);
  const m = objectMatrix(o);
  const a = v(0).applyMatrix4(m), b = v(1).applyMatrix4(m), c = v(2).applyMatrix4(m);
  return b.sub(a).cross(c.sub(a)).normalize();
}

/**
 * Finds the orientation with the largest flat area facing down: triangle
 * areas are summed per (rounded) normal direction.
 */
export function largestFlatNormal(o: SceneObject): Vector3 | null {
  const p = o.geometry.getAttribute('position').array as Float32Array;
  const m = objectMatrix(o);
  const buckets = new Map<string, { area: number; n: Vector3 }>();
  const a = new Vector3(), b = new Vector3(), c = new Vector3();
  for (let t = 0; t < p.length / 9; t++) {
    a.set(p[t * 9]!, p[t * 9 + 1]!, p[t * 9 + 2]!).applyMatrix4(m);
    b.set(p[t * 9 + 3]!, p[t * 9 + 4]!, p[t * 9 + 5]!).applyMatrix4(m);
    c.set(p[t * 9 + 6]!, p[t * 9 + 7]!, p[t * 9 + 8]!).applyMatrix4(m);
    const n = b.clone().sub(a).cross(c.clone().sub(a));
    const area = n.length() / 2;
    if (area < 1e-9) continue;
    n.normalize();
    const key = `${Math.round(n.x * 50)},${Math.round(n.y * 50)},${Math.round(n.z * 50)}`;
    const cur = buckets.get(key);
    if (cur) {
      cur.area += area;
      cur.n.addScaledVector(n, area);
    } else buckets.set(key, { area, n: n.clone().multiplyScalar(area) });
  }
  let best: { area: number; n: Vector3 } | null = null;
  for (const v of buckets.values()) if (!best || v.area > best.area) best = v;
  return best ? best.n.normalize() : null;
}

/** Rotates about Z (around the bbox centre) so the footprint rectangle is as small as possible. */
export function minimizeFootprint(o: SceneObject): SceneObject {
  const p = o.geometry.getAttribute('position').array as Float32Array;
  const m = objectMatrix(o);
  const step = Math.max(1, Math.floor(p.length / 3 / 20000));
  const xs: number[] = [], ys: number[] = [];
  const v = new Vector3();
  for (let i = 0; i < p.length / 3; i += step) {
    v.set(p[i * 3]!, p[i * 3 + 1]!, p[i * 3 + 2]!).applyMatrix4(m);
    xs.push(v.x); ys.push(v.y);
  }
  let best = 0, bestArea = Infinity;
  for (let deg = 0; deg < 90; deg += 0.5) {
    const r = (deg * Math.PI) / 180, c = Math.cos(r), sn = Math.sin(r);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < xs.length; i++) {
      const x = xs[i]! * c - ys[i]! * sn, y = xs[i]! * sn + ys[i]! * c;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const area = (x1 - x0) * (y1 - y0);
    if (area < bestArea - 1e-9) { bestArea = area; best = r; }
  }
  if (!best) return o;
  const c = worldBox(o).getCenter(new Vector3());
  const rot = new Matrix4().makeTranslation(c.x, c.y, c.z).multiply(new Matrix4().makeRotationZ(best)).multiply(new Matrix4().makeTranslation(-c.x, -c.y, -c.z));
  return droppedToGrid({ ...o, ...withWorldTransform(o, rot) });
}

export function autoOrientSelected() {
  const s = useSceneStore.getState();
  const sel = new Set(s.selectedIds);
  if (!sel.size) return;
  s.apply('Auto orient', {
    objects: s.objects.map((o) => {
      if (!sel.has(o.id)) return o;
      const n = largestFlatNormal(o);
      return n ? minimizeFootprint(faceDown(o, n)) : o;
    }),
  });
}
