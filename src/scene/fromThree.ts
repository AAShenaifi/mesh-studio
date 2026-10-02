import { Mesh, type Color, type BufferAttribute, type Material, type Object3D } from 'three';
import { linearToHex, paletteIndexFor } from './palette';

export interface FlatMesh {
  /** World-space, non-indexed, 9 floats per triangle. */
  positions: Float32Array;
  faceColors: Uint16Array;
}

function materialColor(m: Material | undefined): string | null {
  const c = (m as (Material & { color?: Color }) | undefined)?.color;
  return c ? `#${c.getHexString()}` : null;
}

/**
 * Flattens every mesh under `root` into one world-space triangle soup.
 * Material colours and vertex colours become palette indices; a plain white
 * or missing material maps to the default colour (index 0).
 */
export function flattenObject(root: Object3D, palette: string[], useMaterialColors: boolean): FlatMesh {
  root.updateMatrixWorld(true);
  const parts: Array<{ pos: Float32Array; col: Uint16Array }> = [];
  let total = 0;
  const v = new Float32Array(3);
  root.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    const g = node.geometry;
    const pos = g.getAttribute('position') as BufferAttribute | undefined;
    if (!pos) return;
    const index = g.getIndex();
    const triangles = Math.floor((index ? index.count : pos.count) / 3);
    if (!triangles) return;
    const out = new Float32Array(triangles * 9);
    const col = new Uint16Array(triangles);
    const m = node.matrixWorld;
    const colors = g.getAttribute('color') as BufferAttribute | undefined;
    const materials: Material[] = Array.isArray(node.material) ? node.material : [node.material];
    // Material per triangle via geometry groups (multi-material meshes).
    const triMaterial = new Int32Array(triangles);
    if (g.groups.length && Array.isArray(node.material)) {
      for (const grp of g.groups) {
        for (let t = Math.floor(grp.start / 3); t < Math.floor((grp.start + grp.count) / 3) && t < triangles; t++) triMaterial[t] = grp.materialIndex ?? 0;
      }
    }
    const matIndex = materials.map((mat) => {
      const hex = useMaterialColors ? materialColor(mat) : null;
      return hex && hex !== '#ffffff' ? paletteIndexFor(palette, hex) : 0;
    });
    const det = m.determinant();
    for (let t = 0; t < triangles; t++) {
      for (let k = 0; k < 3; k++) {
        const vi = index ? index.getX(t * 3 + k) : t * 3 + k;
        v[0] = pos.getX(vi); v[1] = pos.getY(vi); v[2] = pos.getZ(vi);
        const e = m.elements;
        const x = v[0], y = v[1], z = v[2];
        const slot = det < 0 ? (k === 0 ? 0 : 3 - k) : k; // keep outward winding under mirroring
        out[t * 9 + slot * 3] = e[0]! * x + e[4]! * y + e[8]! * z + e[12]!;
        out[t * 9 + slot * 3 + 1] = e[1]! * x + e[5]! * y + e[9]! * z + e[13]!;
        out[t * 9 + slot * 3 + 2] = e[2]! * x + e[6]! * y + e[10]! * z + e[14]!;
      }
      if (colors) {
        let r = 0, gg = 0, b = 0;
        for (let k = 0; k < 3; k++) {
          const vi = index ? index.getX(t * 3 + k) : t * 3 + k;
          r += colors.getX(vi); gg += colors.getY(vi); b += colors.getZ(vi);
        }
        const hex = linearToHex(r / 3, gg / 3, b / 3);
        col[t] = hex === '#ffffff' ? 0 : paletteIndexFor(palette, hex);
      } else {
        col[t] = matIndex[triMaterial[t]!] ?? 0;
      }
    }
    parts.push({ pos: out, col });
    total += triangles;
  });
  const positions = new Float32Array(total * 9);
  const faceColors = new Uint16Array(total);
  let o = 0;
  for (const p of parts) {
    positions.set(p.pos, o * 9);
    faceColors.set(p.col, o);
    o += p.col.length;
  }
  return { positions, faceColors };
}

/** Rotates Y-up data to Z-up in place: (x, y, z) → (x, -z, y). */
export function yUpToZUp(positions: Float32Array): void {
  for (let i = 0; i < positions.length; i += 3) {
    const y = positions[i + 1]!, z = positions[i + 2]!;
    positions[i + 1] = -z;
    positions[i + 2] = y;
  }
}

/** Inverse of yUpToZUp: (x, y, z) → (x, z, -y). */
export function zUpToYUp(positions: Float32Array): void {
  for (let i = 0; i < positions.length; i += 3) {
    const y = positions[i + 1]!, z = positions[i + 2]!;
    positions[i + 1] = z;
    positions[i + 2] = -y;
  }
}

