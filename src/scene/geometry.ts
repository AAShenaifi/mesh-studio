import { Box3, BufferAttribute, BufferGeometry, Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { Mesh } from 'three';
import { hexToLinear255 } from './palette';
import type { SceneObject, Vec3 } from './types';

// BVH-accelerated raycasting for picking and painting on large meshes.
(BufferGeometry.prototype as any).computeBoundsTree = computeBoundsTree;
(BufferGeometry.prototype as any).disposeBoundsTree = disposeBoundsTree;
Mesh.prototype.raycast = acceleratedRaycast;

/** Builds the BVH for a geometry once (used by picking and painting). */
export function ensureBoundsTree(geometry: BufferGeometry): void {
  const g = geometry as BufferGeometry & { boundsTree?: unknown; computeBoundsTree: () => void };
  if (!g.boundsTree) g.computeBoundsTree();
}

/** Centres non-indexed positions on their bounding-box centre (in place). Returns the removed offset. */
export function centerPositions(positions: Float32Array): Vec3 {
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i]!, y = positions[i + 1]!, z = positions[i + 2]!;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
  for (let i = 0; i < positions.length; i += 3) {
    positions[i]! -= cx; positions[i + 1]! -= cy; positions[i + 2]! -= cz;
  }
  return [cx, cy, cz];
}

/** Writes per-vertex colours (3 per triangle) from palette indices. */
export function writeColors(geometry: BufferGeometry, faceColors: Uint16Array, palette: string[]): void {
  const rgb = palette.map(hexToLinear255);
  const fallback = rgb[0] ?? [200, 200, 200];
  const vertCount = faceColors.length * 3;
  let attr = geometry.getAttribute('color') as BufferAttribute | undefined;
  if (!attr || attr.count !== vertCount) {
    attr = new BufferAttribute(new Uint8Array(vertCount * 3), 3, true);
    geometry.setAttribute('color', attr);
  }
  const a = attr.array as Uint8Array;
  for (let t = 0; t < faceColors.length; t++) {
    const c = rgb[faceColors[t]!] ?? fallback;
    for (let v = 0; v < 3; v++) {
      const o = (t * 3 + v) * 3;
      a[o] = c[0]; a[o + 1] = c[1]; a[o + 2] = c[2];
    }
  }
  attr.clearUpdateRanges();
  attr.needsUpdate = true;
}

/** Non-indexed geometry with flat normals and palette colours. Takes ownership of `positions`. */
export function makeGeometry(positions: Float32Array, faceColors: Uint16Array, palette: string[]): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(positions, 3));
  g.computeVertexNormals();
  writeColors(g, faceColors, palette);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

export function objectMatrix(o: Pick<SceneObject, 'position' | 'rotation' | 'scale'>): Matrix4 {
  return new Matrix4().compose(
    new Vector3(...o.position),
    new Quaternion().setFromEuler(new Euler(o.rotation[0], o.rotation[1], o.rotation[2], 'XYZ')),
    new Vector3(...o.scale),
  );
}

/** World-space non-indexed positions of an object (new array). */
export function worldPositions(o: SceneObject): Float32Array {
  const src = o.geometry.getAttribute('position').array as Float32Array;
  const out = new Float32Array(src.length);
  const e = objectMatrix(o).elements;
  for (let i = 0; i < src.length; i += 3) {
    const x = src[i]!, y = src[i + 1]!, z = src[i + 2]!;
    out[i] = e[0]! * x + e[4]! * y + e[8]! * z + e[12]!;
    out[i + 1] = e[1]! * x + e[5]! * y + e[9]! * z + e[13]!;
    out[i + 2] = e[2]! * x + e[6]! * y + e[10]! * z + e[14]!;
  }
  // A mirroring transform (negative determinant) flips winding; restore outward orientation.
  if (objectMatrix(o).determinant() < 0) flipWinding(out);
  return out;
}

export function flipWinding(positions: Float32Array): void {
  for (let i = 0; i < positions.length; i += 9) {
    for (let k = 0; k < 3; k++) {
      const t = positions[i + 3 + k]!;
      positions[i + 3 + k] = positions[i + 6 + k]!;
      positions[i + 6 + k] = t;
    }
  }
}

const boxCache = new WeakMap<SceneObject, Box3>();

/** Exact world-space bounding box (walks all vertices; cached per immutable record). */
export function worldBox(o: SceneObject): Box3 {
  const hit = boxCache.get(o);
  if (hit) return hit.clone();
  const box = computeWorldBox(o);
  boxCache.set(o, box.clone());
  return box;
}

function computeWorldBox(o: SceneObject): Box3 {
  const src = o.geometry.getAttribute('position').array as Float32Array;
  const e = objectMatrix(o).elements;
  const box = new Box3();
  const min = box.min.set(Infinity, Infinity, Infinity), max = box.max.set(-Infinity, -Infinity, -Infinity);
  for (let i = 0; i < src.length; i += 3) {
    const x = src[i]!, y = src[i + 1]!, z = src[i + 2]!;
    const wx = e[0]! * x + e[4]! * y + e[8]! * z + e[12]!;
    const wy = e[1]! * x + e[5]! * y + e[9]! * z + e[13]!;
    const wz = e[2]! * x + e[6]! * y + e[10]! * z + e[14]!;
    if (wx < min.x) min.x = wx; if (wx > max.x) max.x = wx;
    if (wy < min.y) min.y = wy; if (wy > max.y) max.y = wy;
    if (wz < min.z) min.z = wz; if (wz > max.z) max.z = wz;
  }
  return box;
}

export function boxOf(objects: SceneObject[]): Box3 {
  const box = new Box3();
  for (const o of objects) box.union(worldBox(o));
  return box;
}
