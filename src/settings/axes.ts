import { Vector3 } from 'three';

// The workspace keeps model data in its own coordinates and changes how the
// view is oriented: with Z-up the grid lies in the XY plane and the camera's
// up vector is +Z; with Y-up the grid lies in XZ and up is +Y.

export type UpAxis = 'z' | 'y';

/** Index of the up axis in an [x, y, z] tuple. */
export function upIndex(up: UpAxis): 1 | 2 {
  return up === 'z' ? 2 : 1;
}

export function upVector(up: UpAxis): Vector3 {
  return up === 'z' ? new Vector3(0, 0, 1) : new Vector3(0, 1, 0);
}

/**
 * Builds a world-space vector from workspace-relative components:
 * `right` and `back` lie in the ground plane, `height` goes along the up axis.
 * Z-up: (right, back, height) → (x, y, z). Y-up: → (x, height, -back).
 */
export function workspaceVector(up: UpAxis, right: number, back: number, height: number): Vector3 {
  return up === 'z' ? new Vector3(right, back, height) : new Vector3(right, height, -back);
}
