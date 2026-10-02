import { Vector3, type BufferAttribute, type BufferGeometry } from 'three';
import { INTERSECTED, NOT_INTERSECTED, type MeshBVH } from 'three-mesh-bvh';
import { weld } from '../../geometry/meshOps';
import { ensureBoundsTree } from '../../scene/geometry';
import { hexToLinear255 } from '../../scene/palette';

/**
 * Our geometries are non-indexed (3 vertices per triangle). The BVH adds an
 * index and reorders it, so BVH/raycast triangle ids map back through it.
 */
export function originalTriangle(geometry: BufferGeometry, bvhTri: number): number {
  const index = geometry.getIndex();
  return index ? Math.floor(index.getX(bvhTri * 3) / 3) : bvhTri;
}

/** Original triangle ids within `radius` of a local-space point. */
export function trianglesInSphere(geometry: BufferGeometry, center: Vector3, radius: number): number[] {
  ensureBoundsTree(geometry);
  const bvh = (geometry as BufferGeometry & { boundsTree: MeshBVH }).boundsTree;
  const out: number[] = [];
  const tmp = new Vector3();
  bvh.shapecast({
    intersectsBounds: (box) => (box.distanceToPoint(center) <= radius ? INTERSECTED : NOT_INTERSECTED),
    intersectsTriangle: (tri, i) => {
      if (tri.closestPointToPoint(center, tmp).distanceTo(center) <= radius) out.push(originalTriangle(geometry, i));
    },
  });
  return out;
}

interface Adjacency {
  /** 3 neighbour triangles per triangle (-1 = open edge). */
  neighbors: Int32Array;
  normals: Float32Array;
}
const adjacencyCache = new WeakMap<BufferGeometry, Adjacency>();

/** Edge adjacency over welded vertices plus face normals (cached per geometry). */
export function adjacency(geometry: BufferGeometry): Adjacency {
  const hit = adjacencyCache.get(geometry);
  if (hit) return hit;
  const pos = (geometry.getAttribute('position') as BufferAttribute).array as Float32Array;
  const tris = pos.length / 9;
  const { index, count } = weld(pos);
  const keys = new Float64Array(tris * 3);
  const owner = new Int32Array(tris * 3);
  for (let t = 0; t < tris; t++) for (let k = 0; k < 3; k++) {
    const a = index[t * 3 + k]!, b = index[t * 3 + ((k + 1) % 3)]!;
    keys[t * 3 + k] = a < b ? a * count + b : b * count + a;
    owner[t * 3 + k] = t * 3 + k;
  }
  const order = Array.from(owner).sort((x, y) => keys[x]! - keys[y]!);
  const neighbors = new Int32Array(tris * 3).fill(-1);
  for (let i = 0; i < order.length; ) {
    let j = i + 1;
    while (j < order.length && keys[order[j]!] === keys[order[i]!]) j++;
    if (j - i >= 2) {
      // pair the first two users of the edge (non-manifold extras stay unlinked)
      const e1 = order[i]!, e2 = order[i + 1]!;
      neighbors[e1] = Math.floor(e2 / 3);
      neighbors[e2] = Math.floor(e1 / 3);
    }
    i = j;
  }
  const normals = new Float32Array(tris * 3);
  for (let t = 0; t < tris; t++) {
    const o = t * 9;
    const ax = pos[o + 3]! - pos[o]!, ay = pos[o + 4]! - pos[o + 1]!, az = pos[o + 5]! - pos[o + 2]!;
    const bx = pos[o + 6]! - pos[o]!, by = pos[o + 7]! - pos[o + 1]!, bz = pos[o + 8]! - pos[o + 2]!;
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    normals[t * 3] = nx; normals[t * 3 + 1] = ny; normals[t * 3 + 2] = nz;
  }
  const adj = { neighbors, normals };
  adjacencyCache.set(geometry, adj);
  return adj;
}

/** Flood fill from `start` across edges: same colour, and edge angle ≤ maxAngle (degrees). */
export function floodFill(geometry: BufferGeometry, colors: Uint16Array, start: number, maxAngle: number): number[] {
  const { neighbors, normals } = adjacency(geometry);
  const cos = Math.cos((Math.min(maxAngle, 180) * Math.PI) / 180) - 1e-6;
  const seed = colors[start]!;
  const seen = new Uint8Array(colors.length);
  const stack = [start];
  const out: number[] = [];
  seen[start] = 1;
  while (stack.length) {
    const t = stack.pop()!;
    out.push(t);
    for (let k = 0; k < 3; k++) {
      const n = neighbors[t * 3 + k]!;
      if (n < 0 || seen[n] || colors[n] !== seed) continue;
      const d = normals[t * 3]! * normals[n * 3]! + normals[t * 3 + 1]! * normals[n * 3 + 1]! + normals[t * 3 + 2]! * normals[n * 3 + 2]!;
      if (maxAngle < 180 && d < cos) continue;
      seen[n] = 1;
      stack.push(n);
    }
  }
  return out;
}

/** Recolours triangles in the geometry's colour attribute (in place). */
export function writeTriangleColors(geometry: BufferGeometry, tris: number[], hex: string) {
  const attr = geometry.getAttribute('color') as BufferAttribute;
  const a = attr.array as Uint8Array;
  const [r, g, b] = hexToLinear255(hex);
  let lo = Infinity, hi = -1;
  for (const t of tris) {
    if (t < lo) lo = t;
    if (t > hi) hi = t;
    for (let v = 0; v < 3; v++) {
      const o = (t * 3 + v) * 3;
      a[o] = r; a[o + 1] = g; a[o + 2] = b;
    }
  }
  if (hi < 0) return;
  // Upload only the touched span (a full 1M-triangle colour buffer is 9 MB).
  attr.clearUpdateRanges();
  attr.addUpdateRange(lo * 9, (hi - lo + 1) * 9);
  attr.needsUpdate = true;
}
