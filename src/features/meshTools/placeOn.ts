// Place on face: the selected object is turned so its bottom faces the clicked
// face of another object, then set down on it, centred at the click (like 3D
// Builder's "place on"; reimplemented). Also a snap target for stacking parts.
import { useEffect } from 'react';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { selectedObjects, useSceneStore, withWorldTransform } from '../../store/useSceneStore';
import { useAppStore } from '../../store/useAppStore';
import { worldBox, worldPositions } from '../../scene/geometry';
import type { SceneObject, Vec3 } from '../../scene/types';
import { viewportHandlers } from '../../viewport/SceneObjects';
import { originalTriangle } from '../paint/meshQuery';
import { worldFaceNormal } from '../prep/orient';

/** `o` turned so world-down points along -n and moved so its lowest point (along n) touches `point`, centred there. */
export function placeOnFace(o: SceneObject, point: Vector3, n: Vector3): SceneObject {
  const normal = n.clone().normalize();
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 0, -1), normal.clone().negate());
  const c = worldBox(o).getCenter(new Vector3());
  const rot = new Matrix4().makeTranslation(c.x, c.y, c.z).multiply(new Matrix4().makeRotationFromQuaternion(q)).multiply(new Matrix4().makeTranslation(-c.x, -c.y, -c.z));
  const turned: SceneObject = { ...o, ...withWorldTransform(o, rot) };
  const p = worldPositions(turned);
  let lo = Infinity;
  const centroid = new Vector3();
  for (let i = 0; i < p.length; i += 3) {
    const d = p[i]! * normal.x + p[i + 1]! * normal.y + p[i + 2]! * normal.z;
    if (d < lo) lo = d;
    centroid.x += p[i]!; centroid.y += p[i + 1]!; centroid.z += p[i + 2]!;
  }
  centroid.divideScalar(p.length / 3);
  // move along n so the lowest point touches the face, and across the face so the centre sits on the click
  const along = point.dot(normal) - lo;
  const across = point.clone().sub(centroid);
  across.addScaledVector(normal, -across.dot(normal));
  const shift = across.addScaledVector(normal, along);
  return { ...turned, position: [turned.position[0] + shift.x, turned.position[1] + shift.y, turned.position[2] + shift.z] as Vec3 };
}

/** Viewport tool: click a face of another object to put the selected object on it. */
export function PlaceOnTool() {
  const active = useAppStore((s) => s.activeTool === 'placeon');
  useEffect(() => {
    if (!active) return;
    viewportHandlers.click = (e, target) => {
      const s = useSceneStore.getState();
      const moving = selectedObjects(s)[0];
      if (!moving || e.faceIndex == null) return true;
      if (target.id === moving.id) {
        useAppStore.getState().setReady('Click a face of a different object');
        return true;
      }
      const n = worldFaceNormal(target, originalTriangle(target.geometry, e.faceIndex));
      const placed = placeOnFace(moving, e.point.clone(), n);
      s.apply(`Place ${moving.name} on ${target.name}`, { objects: s.objects.map((o) => (o.id === moving.id ? placed : o)) });
      useAppStore.getState().setActiveTool(null);
      useAppStore.getState().setReady(`${moving.name} placed on ${target.name}`);
      return true;
    };
    return () => {
      viewportHandlers.click = null;
    };
  }, [active]);
  return null;
}
