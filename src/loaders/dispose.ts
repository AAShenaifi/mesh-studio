import { Mesh, Line, Points, type Material, type Object3D, type Texture } from 'three';

function disposeMaterial(material: Material) {
  for (const value of Object.values(material)) {
    if (value && typeof value === 'object' && (value as Texture).isTexture) (value as Texture).dispose();
  }
  material.dispose();
}

/** Frees GPU memory held by every geometry, material and texture under `root`. */
export function disposeObject(root: Object3D): void {
  root.traverse((node) => {
    if (node instanceof Mesh || node instanceof Line || node instanceof Points) {
      node.geometry.dispose();
      const materials: Material[] = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach(disposeMaterial);
    }
  });
  root.removeFromParent();
}
