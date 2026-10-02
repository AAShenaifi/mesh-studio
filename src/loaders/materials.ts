import { DoubleSide, MeshStandardMaterial } from 'three';

/** Default look for formats without their own materials (STL, OBJ). Same lilac as STL Studio. */
export function createModelMaterial(vertexColors = false): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: vertexColors ? 0xffffff : 0xb58fd0,
    vertexColors,
    roughness: 0.55,
    metalness: 0.05,
    // Imported meshes are often not watertight or have flipped faces; show both sides.
    side: DoubleSide,
  });
}
