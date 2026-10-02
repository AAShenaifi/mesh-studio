import { Box3 } from 'three';
import { centerPositions, makeGeometry, boxOf } from './geometry';
import type { ObjectSource, SceneObject, Vec3 } from './types';
import { newId, useSceneStore } from '../store/useSceneStore';

export type Placement =
  /** Keep the world position the triangles already have (cut halves, boolean results). */
  | 'keep'
  /** Put it next to the existing objects, resting on the grid. */
  | 'beside';

/**
 * Turns a world-space triangle soup into a scene object. Takes ownership of
 * both arrays. Geometry is re-centred so the object's origin is its bbox centre.
 */
export function createObject(
  name: string,
  positions: Float32Array,
  faceColors: Uint16Array,
  source: ObjectSource,
  placement: Placement,
  existing: SceneObject[] = useSceneStore.getState().objects,
): SceneObject {
  const center = centerPositions(positions);
  const geometry = makeGeometry(positions, faceColors, useSceneStore.getState().palette);
  let position: Vec3 = center;
  if (placement === 'beside') {
    const bb = geometry.boundingBox ?? new Box3();
    const halfX = (bb.max.x - bb.min.x) / 2;
    const zLift = -bb.min.z; // rest on grid
    if (existing.length) {
      const scene = boxOf(existing);
      position = [scene.max.x + 8 + halfX, (scene.min.y + scene.max.y) / 2, zLift];
    } else {
      position = [0, 0, zLift];
    }
  }
  return { id: newId(), name, geometry, faceColors, position, rotation: [0, 0, 0], scale: [1, 1, 1], visible: true, source };
}
