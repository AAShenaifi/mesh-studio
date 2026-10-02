// Pure mesh utilities shared by the kernel worker (no three.js, no DOM).

/** Welds coincident corners of a triangle soup. Open-addressing hash on quantised coordinates. */
export function weld(positions: Float32Array, tolerance = 1e-4): { index: Uint32Array; verts: Float32Array; count: number } {
  const corners = positions.length / 3;
  let cap = 1;
  while (cap < corners * 2) cap <<= 1;
  const mask = cap - 1;
  const slotKey = new Int32Array(cap * 3);
  const slotVal = new Int32Array(cap).fill(-1);
  const index = new Uint32Array(corners);
  const verts = new Float32Array(positions.length);
  const inv = 1 / tolerance;
  let count = 0;
  for (let c = 0; c < corners; c++) {
    const x = Math.round(positions[c * 3]! * inv) | 0;
    const y = Math.round(positions[c * 3 + 1]! * inv) | 0;
    const z = Math.round(positions[c * 3 + 2]! * inv) | 0;
    let h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) & mask;
    for (;;) {
      const v = slotVal[h]!;
      if (v === -1) {
        slotVal[h] = count;
        slotKey[h * 3] = x; slotKey[h * 3 + 1] = y; slotKey[h * 3 + 2] = z;
        verts[count * 3] = positions[c * 3]!; verts[count * 3 + 1] = positions[c * 3 + 1]!; verts[count * 3 + 2] = positions[c * 3 + 2]!;
        index[c] = count++;
        break;
      }
      if (slotKey[h * 3] === x && slotKey[h * 3 + 1] === y && slotKey[h * 3 + 2] === z) {
        index[c] = v;
        break;
      }
      h = (h + 1) & mask;
    }
  }
  return { index, verts: verts.subarray(0, count * 3), count };
}

export interface Analysis {
  triangles: number;
  vertices: number;
  volume: number;
  area: number;
  bboxMin: [number, number, number];
  bboxMax: [number, number, number];
  boundaryEdges: number;
  nonManifoldEdges: number;
  degenerate: number;
  components: number;
  /** Lowest z of each connected piece, for floating-part detection. */
  componentMinZ: number[];
  /** Signed volume of each piece (negative = an inner cavity shell). */
  componentVolume: number[];
  watertight: boolean;
}

/** Topology and measures of a world-space soup. Pure JS, O(n log n). */
export function analyzeSoup(positions: Float32Array): Analysis {
  const tris = positions.length / 9;
  const { index, count } = weld(positions);
  let volume = 0, area = 0, degenerate = 0;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  const keys = new Float64Array(tris * 3);
  let k = 0;
  for (let t = 0; t < tris; t++) {
    const o = t * 9;
    const x1 = positions[o]!, y1 = positions[o + 1]!, z1 = positions[o + 2]!;
    const x2 = positions[o + 3]!, y2 = positions[o + 4]!, z2 = positions[o + 5]!;
    const x3 = positions[o + 6]!, y3 = positions[o + 7]!, z3 = positions[o + 8]!;
    for (let v = 0; v < 3; v++) for (let a = 0; a < 3; a++) {
      const val = positions[o + v * 3 + a]!;
      if (val < min[a]!) min[a] = val;
      if (val > max[a]!) max[a] = val;
    }
    volume += (x1 * (y2 * z3 - z2 * y3) - y1 * (x2 * z3 - z2 * x3) + z1 * (x2 * y3 - y2 * x3)) / 6;
    const ax = x2 - x1, ay = y2 - y1, az = z2 - z1, bx = x3 - x1, by = y3 - y1, bz = z3 - z1;
    const cross = Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
    area += cross / 2;
    const a = index[t * 3]!, b = index[t * 3 + 1]!, c = index[t * 3 + 2]!;
    if (a === b || b === c || a === c || cross < 1e-12) degenerate++;
    const e = (p: number, q: number) => (p < q ? p * count + q : q * count + p);
    keys[k++] = e(a, b); keys[k++] = e(b, c); keys[k++] = e(c, a);
  }
  keys.sort();
  let boundaryEdges = 0, nonManifoldEdges = 0;
  for (let i = 0; i < keys.length; ) {
    let j = i + 1;
    while (j < keys.length && keys[j] === keys[i]) j++;
    const n = j - i;
    if (n === 1) boundaryEdges++;
    else if (n > 2) nonManifoldEdges++;
    i = j;
  }
  // connected pieces (union-find over welded vertices)
  const parent = new Int32Array(count);
  for (let i = 0; i < count; i++) parent[i] = i;
  const find = (x: number) => {
    while (parent[x] !== x) { parent[x] = parent[parent[x]!]!; x = parent[x]!; }
    return x;
  };
  for (let t = 0; t < tris; t++) {
    const a = find(index[t * 3]!), b = find(index[t * 3 + 1]!), c = find(index[t * 3 + 2]!);
    if (a !== b) parent[b] = a;
    const r = find(a);
    if (r !== c) parent[c] = r;
  }
  const minZ = new Map<number, number>();
  const compVol = new Map<number, number>();
  for (let t = 0; t < tris; t++) {
    const r = find(index[t * 3]!);
    const o = t * 9;
    const tv = (positions[o]! * (positions[o + 4]! * positions[o + 8]! - positions[o + 5]! * positions[o + 7]!) - positions[o + 1]! * (positions[o + 3]! * positions[o + 8]! - positions[o + 5]! * positions[o + 6]!) + positions[o + 2]! * (positions[o + 3]! * positions[o + 7]! - positions[o + 4]! * positions[o + 6]!)) / 6;
    compVol.set(r, (compVol.get(r) ?? 0) + tv);
    const z = Math.min(positions[t * 9 + 2]!, positions[t * 9 + 5]!, positions[t * 9 + 8]!);
    const cur = minZ.get(r);
    if (cur === undefined || z < cur) minZ.set(r, z);
  }
  return {
    triangles: tris, vertices: count, volume, area, bboxMin: min, bboxMax: max,
    boundaryEdges, nonManifoldEdges, degenerate, components: minZ.size, componentMinZ: [...minZ.values()], componentVolume: [...minZ.keys()].map((k) => compVol.get(k) ?? 0),
    watertight: boundaryEdges === 0 && nonManifoldEdges === 0,
  };
}

/** Expands an indexed mesh (+ per-triangle ids) to a soup. */
export function expand(verts: ArrayLike<number>, numProp: number, triVerts: ArrayLike<number>, faceIDs: ArrayLike<number>, mapId: (id: number) => number) {
  const tris = triVerts.length / 3;
  const positions = new Float32Array(tris * 9);
  const faceColors = new Uint16Array(tris);
  for (let t = 0; t < tris; t++) {
    for (let k = 0; k < 3; k++) {
      const v = triVerts[t * 3 + k]!;
      positions[t * 9 + k * 3] = verts[v * numProp]!;
      positions[t * 9 + k * 3 + 1] = verts[v * numProp + 1]!;
      positions[t * 9 + k * 3 + 2] = verts[v * numProp + 2]!;
    }
    faceColors[t] = mapId(faceIDs[t] ?? 0);
  }
  return { positions, faceColors };
}

/** Most frequent palette index (used as cap colour after cuts). */
export function dominantColor(faceColors: Uint16Array): number {
  const counts = new Map<number, number>();
  let best = 0, bestN = -1;
  for (const c of faceColors) {
    const n = (counts.get(c) ?? 0) + 1;
    counts.set(c, n);
    if (n > bestN) { bestN = n; best = c; }
  }
  return best;
}
