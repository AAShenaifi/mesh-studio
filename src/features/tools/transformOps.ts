import { Matrix4, Vector3 } from 'three';
import { droppedToGrid, selectedObjects, useSceneStore, withWorldTransform } from '../../store/useSceneStore';
import { worldBox } from '../../scene/geometry';
import type { SceneObject, Vec3 } from '../../scene/types';

/** Applies a world matrix about each selected object's bbox centre, as one undo step. */
export function transformSelected(label: string, m: Matrix4, drop = true) {
  transformObjects(useSceneStore.getState().selectedIds, label, m, drop);
}

/** Applies a world matrix about each listed object's bbox centre, as one undo step. */
export function transformObjects(ids: string[], label: string, m: Matrix4, drop = true) {
  const s = useSceneStore.getState();
  const sel = new Set(ids);
  if (!sel.size) return;
  s.apply(label, {
    objects: s.objects.map((o) => {
      if (!sel.has(o.id)) return o;
      const c = worldBox(o).getCenter(new Vector3());
      const about = new Matrix4().makeTranslation(c.x, c.y, c.z).multiply(m).multiply(new Matrix4().makeTranslation(-c.x, -c.y, -c.z));
      const next: SceneObject = { ...o, ...withWorldTransform(o, about) };
      return drop ? droppedToGrid(next) : next;
    }),
  });
}

export const rotate90 = (axis: 'x' | 'y' | 'z', sign: 1 | -1) =>
  transformSelected(`Rotate ${axis.toUpperCase()} ${sign > 0 ? '+' : '−'}90°`, new Matrix4().makeRotationAxis(new Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0), (sign * Math.PI) / 2));

export const mirror = (axis: 'x' | 'y' | 'z') =>
  transformSelected(`Mirror ${axis.toUpperCase()}`, new Matrix4().makeScale(axis === 'x' ? -1 : 1, axis === 'y' ? -1 : 1, axis === 'z' ? -1 : 1));

/** Scales the selection about its own centres by world factors, then drops to grid. */
export const scaleBy = (label: string, k: Vec3) => transformSelected(label, new Matrix4().makeScale(k[0], k[1], k[2]));

export function selectionSize(): Vec3 | null {
  const sel = selectedObjects(useSceneStore.getState());
  if (sel.length !== 1) return null;
  const b = worldBox(sel[0]!);
  return [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z];
}
