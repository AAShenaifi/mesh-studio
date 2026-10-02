// Ported from Bambu Studio — src/libslic3r/QuadricEdgeCollapse.cpp @ da8b44e
// Original licence: AGPL-3.0 (https://github.com/bambulab/BambuStudio). Translated to TypeScript for Mesh Studio.
// Changes: flat typed arrays instead of structs; a plain binary heap instead of
// MutablePriorityQueue; a vertex's triangle list is relocated to the end of the
// edge buffer when it grows (instead of shifting the following vertices), with
// periodic compaction; no TBB/cancel/status callbacks; returns, per output
// triangle, the input triangle it came from (used to keep face colours).

/** Indexed triangle set: 3 floats per vertex, 3 indices per triangle. */
export interface IndexedMesh {
  vertices: Float64Array | Float32Array;
  indices: Uint32Array;
}

export interface SimplifyResult {
  vertices: Float64Array;
  indices: Uint32Array;
  /** For each output triangle, the input triangle index it survived as. */
  sourceTriangle: Uint32Array;
  /** Quadric error of the last collapse (0 when nothing collapsed). */
  lastError: number;
}

// Symmetric 4×4 matrix stored as 10 values: [a², ab, ac, ad, b², bc, bd, c², cd, d²].
const N = 10;

function det(m: Float64Array, o: number, a11: number, a12: number, a13: number, a21: number, a22: number, a23: number, a31: number, a32: number, a33: number) {
  return (
    m[o + a11]! * m[o + a22]! * m[o + a33]! + m[o + a13]! * m[o + a21]! * m[o + a32]! + m[o + a12]! * m[o + a23]! * m[o + a31]! -
    m[o + a13]! * m[o + a22]! * m[o + a31]! - m[o + a11]! * m[o + a23]! * m[o + a32]! - m[o + a12]! * m[o + a21]! * m[o + a33]!
  );
}

function vertexError(q: Float64Array, o: number, x: number, y: number, z: number) {
  return (
    q[o]! * x * x + 2 * q[o + 1]! * x * y + 2 * q[o + 2]! * x * z + 2 * q[o + 3]! * x +
    q[o + 4]! * y * y + 2 * q[o + 5]! * y * z + 2 * q[o + 6]! * y +
    q[o + 7]! * z * z + 2 * q[o + 8]! * z + q[o + 9]!
  );
}

/**
 * Collapses edges by smallest quadric error until `triangleCount` is reached or
 * the next collapse would exceed `maxError`. Input is not modified.
 */
export function quadricEdgeCollapse(input: IndexedMesh, triangleCount: number, maxError = Infinity): SimplifyResult {
  const V = Float64Array.from(input.vertices);
  const I = Uint32Array.from(input.indices);
  const nv = V.length / 3;
  const nt = I.length / 3;
  const identity = () => {
    const src = new Uint32Array(nt);
    for (let i = 0; i < nt; i++) src[i] = i;
    return { vertices: V, indices: I, sourceTriangle: src, lastError: 0 };
  };
  if (triangleCount >= nt || maxError <= 0) return identity();

  // ---- triangle info: normal (x > 2 marks deleted) and edge with minimal error
  const tN = new Float64Array(nt * 3);
  const tMin = new Uint8Array(nt);
  const deleted = (t: number) => tN[t * 3]! > 2;
  const setNormal = (t: number) => {
    const a = I[t * 3]! * 3, b = I[t * 3 + 1]! * 3, c = I[t * 3 + 2]! * 3;
    const ux = V[b]! - V[a]!, uy = V[b + 1]! - V[a + 1]!, uz = V[b + 2]! - V[a + 2]!;
    const vx = V[c]! - V[a]!, vy = V[c + 1]! - V[a + 1]!, vz = V[c + 2]! - V[a + 2]!;
    let x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx;
    const l = Math.hypot(x, y, z);
    if (l > 0) { x /= l; y /= l; z /= l; }
    tN[t * 3] = x; tN[t * 3 + 1] = y; tN[t * 3 + 2] = z;
  };

  // ---- vertex info: summed quadric + range of incident triangles in the edge buffer
  const vQ = new Float64Array(nv * N);
  const vStart = new Uint32Array(nv);
  const vCount = new Uint32Array(nv);
  const vCap = new Uint32Array(nv);

  for (let t = 0; t < nt; t++) {
    setNormal(t);
    const nx = tN[t * 3]!, ny = tN[t * 3 + 1]!, nz = tN[t * 3 + 2]!;
    const v0 = I[t * 3]! * 3;
    const d = -(nx * V[v0]! + ny * V[v0 + 1]! + nz * V[v0 + 2]!);
    const q = [nx * nx, nx * ny, nx * nz, nx * d, ny * ny, ny * nz, ny * d, nz * nz, nz * d, d * d];
    for (let e = 0; e < 3; e++) {
      const v = I[t * 3 + e]!;
      for (let k = 0; k < N; k++) vQ[v * N + k] = vQ[v * N + k]! + q[k]!;
      vCount[v]!++;
    }
  }
  let start = 0;
  for (let v = 0; v < nv; v++) {
    vStart[v] = start;
    vCap[v] = vCount[v]!;
    start += vCount[v]!;
    vCount[v] = 0;
  }
  // edge infos: triangle index + which corner of it is this vertex
  let eCapTotal = Math.max(16, Math.ceil(nt * 3 * 1.5));
  let eT = new Uint32Array(eCapTotal);
  let eE = new Uint8Array(eCapTotal);
  let eEnd = nt * 3;
  for (let t = 0; t < nt; t++) for (let j = 0; j < 3; j++) {
    const v = I[t * 3 + j]!;
    const ei = vStart[v]! + vCount[v]!;
    eT[ei] = t; eE[ei] = j;
    vCount[v]!++;
  }

  // ---- error helpers
  const qTmp = new Float64Array(N);
  const sumQ = (a: number, b: number) => {
    for (let k = 0; k < N; k++) qTmp[k] = vQ[a * N + k]! + vQ[b * N + k]!;
  };
  const out = [0, 0, 0];
  /** Optimal vertex for quadric qTmp (or the best of both ends / midpoint when singular). Returns its error. */
  const solve = (a: number, b: number): number => {
    const dt = det(qTmp, 0, 0, 1, 2, 1, 4, 5, 2, 5, 7);
    if (Math.abs(dt) < Number.EPSILON) {
      const ax = V[a * 3]!, ay = V[a * 3 + 1]!, az = V[a * 3 + 2]!;
      const bx = V[b * 3]!, by = V[b * 3 + 1]!, bz = V[b * 3 + 2]!;
      const cand = [ax, ay, az, bx, by, bz, (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2];
      let best = 0, bestE = Infinity;
      for (let i = 0; i < 3; i++) {
        const e = vertexError(qTmp, 0, cand[i * 3]!, cand[i * 3 + 1]!, cand[i * 3 + 2]!);
        if (e < bestE) { bestE = e; best = i; }
      }
      out[0] = cand[best * 3]!; out[1] = cand[best * 3 + 1]!; out[2] = cand[best * 3 + 2]!;
      return bestE;
    }
    const det1 = -1 / dt;
    out[0] = det1 * det(qTmp, 0, 1, 2, 3, 4, 5, 6, 5, 7, 8);
    out[1] = -det1 * det(qTmp, 0, 0, 2, 3, 1, 5, 6, 2, 7, 8);
    out[2] = det1 * det(qTmp, 0, 0, 1, 3, 1, 4, 6, 2, 5, 8);
    return vertexError(qTmp, 0, out[0]!, out[1]!, out[2]!);
  };
  const errs = [0, 0, 0];
  const errors3 = (t: number) => {
    for (let j = 0; j < 3; j++) {
      const a = I[t * 3 + j]!, b = I[t * 3 + ((j + 1) % 3)]!;
      sumQ(a, b);
      errs[j] = solve(a, b);
    }
  };
  const triError = (t: number): number => {
    errors3(t);
    const m = errs[0]! < errs[1]! ? (errs[0]! < errs[2]! ? 0 : 2) : errs[1]! < errs[2]! ? 1 : 2;
    tMin[t] = m;
    return errs[m]!;
  };

  // ---- mutable binary min-heap keyed by triangle
  const hVal = new Float64Array(nt);
  const hTri = new Uint32Array(nt);
  const hPos = new Int32Array(nt).fill(-1);
  let hSize = 0;
  const swap = (i: number, j: number) => {
    const v = hVal[i]!, t = hTri[i]!;
    hVal[i] = hVal[j]!; hTri[i] = hTri[j]!; hVal[j] = v; hTri[j] = t;
    hPos[hTri[i]!] = i; hPos[hTri[j]!] = j;
  };
  const up = (i: number) => {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (hVal[p]! <= hVal[i]!) break;
      swap(i, p); i = p;
    }
  };
  const down = (i: number) => {
    for (;;) {
      const l = i * 2 + 1, r = l + 1;
      let m = i;
      if (l < hSize && hVal[l]! < hVal[m]!) m = l;
      if (r < hSize && hVal[r]! < hVal[m]!) m = r;
      if (m === i) return;
      swap(i, m); i = m;
    }
  };
  const push = (t: number, v: number) => {
    hVal[hSize] = v; hTri[hSize] = t; hPos[t] = hSize; hSize++;
    up(hSize - 1);
  };
  const removeAt = (i: number) => {
    const t = hTri[i]!;
    hSize--;
    if (i !== hSize) {
      swap(i, hSize);
      down(i); up(i);
    }
    hPos[t] = -1;
  };
  const update = (t: number, v: number) => {
    const i = hPos[t]!;
    if (i < 0) return push(t, v);
    hVal[i] = v;
    down(i); up(i);
  };
  for (let t = 0; t < nt; t++) push(t, triError(t));

  // ---- neighbourhood helpers (see the C++ for the reasoning behind each check)
  const findTriangle1 = (vi: number, v: number, ti0: number): number => {
    const end = vStart[v]! + vCount[v]!;
    for (let ei = vStart[v]!; ei < end; ei++) {
      const t = eT[ei]!;
      if (t === ti0) continue;
      const e = eE[ei]!;
      if (I[t * 3 + ((e + 1) % 3)] === vi || I[t * 3 + ((e + 2) % 3)] === vi) return t;
    }
    return -1;
  };
  const swapE = (a: number, b: number) => {
    const t = eT[a]!, e = eE[a]!;
    eT[a] = eT[b]!; eE[a] = eE[b]!; eT[b] = t; eE[b] = e;
  };
  /** Moves the entries of ti0 and ti1 to the last two slots of v's range. */
  const reorderEdges = (v: number, ti0: number, ti1: number) => {
    const last = vStart[v]! + vCount[v]! - 2;
    let swapped = false;
    for (let ei = vStart[v]!; ei < last; ei++) {
      if (eT[ei] === ti0) {
        swapE(ei, last);
        if (swapped) return;
        if (eT[ei] === ti1) { swapE(ei, last + 1); return; }
        swapped = true;
      } else if (eT[ei] === ti1) {
        swapE(ei, last + 1);
        if (swapped) return;
        if (eT[ei] === ti0) { swapE(ei, last); return; }
        swapped = true;
      }
    }
  };
  const THR = 1 - 1.1920929e-7; // 1 - FLT_EPSILON
  const DOT_THR = 0.2; // about 80°
  const isFlipped = (nx: number, ny: number, nz: number, v: number): boolean => {
    const end = vStart[v]! + vCount[v]! - 2;
    for (let ei = vStart[v]!; ei < end; ei++) {
      const t = eT[ei]!, e = eE[ei]!;
      const f = I[t * 3 + ((e + 1) % 3)]! * 3, s = I[t * 3 + ((e + 2) % 3)]! * 3;
      let ax = V[f]! - nx, ay = V[f + 1]! - ny, az = V[f + 2]! - nz;
      let bx = V[s]! - nx, by = V[s + 1]! - ny, bz = V[s + 2]! - nz;
      const la = Math.hypot(ax, ay, az) || 1, lb = Math.hypot(bx, by, bz) || 1;
      ax /= la; ay /= la; az /= la; bx /= lb; by /= lb; bz /= lb;
      const d = ax * bx + ay * by + az * bz;
      if (d > THR || d < -THR) return true;
      let cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
      const lc = Math.hypot(cx, cy, cz) || 1;
      cx /= lc; cy /= lc; cz /= lc;
      if (cx * tN[t * 3]! + cy * tN[t * 3 + 1]! + cz * tN[t * 3 + 2]! < DOT_THR) return true;
    }
    return false;
  };
  const degenerate = (vi: number, v: number): boolean => {
    const end = vStart[v]! + vCount[v]! - 2;
    for (let ei = vStart[v]!; ei < end; ei++) {
      const t = eT[ei]!;
      if (I[t * 3] === vi || I[t * 3 + 1] === vi || I[t * 3 + 2] === vi) return true;
    }
    return false;
  };
  const createNoVolume = (vi0: number, vi1: number): boolean => {
    const end0 = vStart[vi0]! + vCount[vi0]! - 2;
    const end1 = vStart[vi1]! + vCount[vi1]! - 2;
    for (let e0 = vStart[vi0]!; e0 < end0; e0++) {
      const t0 = eT[e0]! * 3;
      let i = 0;
      let a = I[t0 + i]!;
      if (a === vi0) a = I[t0 + ++i]!;
      ++i;
      let b = I[t0 + i]!;
      if (b === vi0) b = I[t0 + ++i]!;
      for (let e1 = vStart[vi1]!; e1 < end1; e1++) {
        const t1 = eT[e1]! * 3;
        let k = 0;
        for (; k < 3; k++) if (I[t1 + k] === b) break;
        if (k >= 3) continue;
        k = (k + 1) % 3;
        if (I[t1 + k] === vi1) k = (k + 1) % 3;
        if (I[t1 + k] === a) return true;
      }
    }
    return false;
  };
  const removeTriangle = (v: number, t: number) => {
    const s = vStart[v]!, last = s + vCount[v]! - 1;
    for (let ei = s; ei < last; ei++) {
      if (eT[ei] === t) {
        eT[ei] = eT[last]!; eE[ei] = eE[last]!;
        vCount[v]!--;
        return;
      }
    }
    vCount[v]!--; // last one is t
  };
  const compactEdges = () => {
    let total = 0;
    for (let v = 0; v < nv; v++) total += vCount[v]!;
    const cap = Math.max(16, Math.ceil(total * 1.5));
    const nT = new Uint32Array(cap), nE = new Uint8Array(cap);
    let p = 0;
    for (let v = 0; v < nv; v++) {
      const s = vStart[v]!, c = vCount[v]!;
      nT.set(eT.subarray(s, s + c), p); nE.set(eE.subarray(s, s + c), p);
      vStart[v] = p; vCap[v] = c;
      p += c;
    }
    eT = nT; eE = nE; eEnd = p; eCapTotal = cap;
  };
  const e1T: number[] = [], e1E: number[] = [];
  const changeNeighbors = (ti0: number, ti1: number, vi0: number, vi1: number, viTop0: number) => {
    let viTop1 = I[ti1 * 3]!;
    if (viTop1 === vi0 || viTop1 === vi1) {
      viTop1 = I[ti1 * 3 + 1]!;
      if (viTop1 === vi0 || viTop1 === vi1) viTop1 = I[ti1 * 3 + 2]!;
    }
    removeTriangle(viTop0, ti0);
    removeTriangle(viTop1, ti1);
    removeTriangle(vi0, ti0);
    removeTriangle(vi0, ti1);
    e1T.length = 0; e1E.length = 0;
    const end1 = vStart[vi1]! + vCount[vi1]!;
    for (let ei = vStart[vi1]!; ei < end1; ei++) {
      const t = eT[ei]!;
      if (t === ti0 || t === ti1) continue;
      e1T.push(t); e1E.push(eE[ei]!);
    }
    vCount[vi1] = 0;
    const need = vCount[vi0]! + e1T.length;
    if (need > vCap[vi0]!) {
      // relocate vi0's list to the end of the buffer with room to grow
      const cap = Math.max(need * 2, 8);
      if (eEnd + cap > eCapTotal) {
        compactEdges();
        if (eEnd + cap > eCapTotal) {
          const grow = Math.ceil((eEnd + cap) * 1.5);
          const nT = new Uint32Array(grow), nE = new Uint8Array(grow);
          nT.set(eT.subarray(0, eEnd)); nE.set(eE.subarray(0, eEnd));
          eT = nT; eE = nE; eCapTotal = grow;
        }
      }
      const s = vStart[vi0]!, c = vCount[vi0]!;
      eT.copyWithin(eEnd, s, s + c); eE.copyWithin(eEnd, s, s + c);
      vStart[vi0] = eEnd; vCap[vi0] = cap;
      eEnd += cap;
    }
    let p = vStart[vi0]! + vCount[vi0]!;
    for (let i = 0; i < e1T.length; i++, p++) { eT[p] = e1T[i]!; eE[p] = e1E[i]!; }
    vCount[vi0] = need;
  };

  // ---- main loop
  let actual = nt;
  let lastError = 0;
  const changed: number[] = [];
  while (actual > triangleCount && hSize > 0) {
    const ti0 = hTri[0]!;
    let value = hVal[0]!;
    if (value >= maxError) break;
    removeAt(0);
    if (deleted(ti0)) continue;
    const m0 = tMin[ti0]!;
    if (m0 > 2) continue;
    let vi0 = I[ti0 * 3 + m0]!;
    let vi1 = I[ti0 * 3 + ((m0 + 1) % 3)]!;
    if (vi0 > vi1) { const x = vi0; vi0 = vi1; vi1 = x; }
    sumQ(vi0, vi1);
    solve(vi0, vi1);
    const nx = out[0]!, ny = out[1]!, nz = out[2]!;
    const ti1 = vCount[vi0]! < vCount[vi1]! ? findTriangle1(vi1, vi0, ti0) : findTriangle1(vi0, vi1, ti0);
    if (ti1 >= 0) {
      reorderEdges(vi0, ti0, ti1);
      reorderEdges(vi1, ti0, ti1);
    }
    if (
      ti1 < 0 ||
      degenerate(vi0, vi1) ||
      degenerate(vi1, vi0) ||
      createNoVolume(vi0, vi1) ||
      isFlipped(nx, ny, nz, vi0) ||
      isFlipped(nx, ny, nz, vi1)
    ) {
      // try the triangle's next-best edge
      errors3(ti0);
      const e = errs;
      const ord = e[0]! < e[1]! ? (e[0]! < e[2]! ? (e[1]! < e[2]! ? [0, 1, 2] : [0, 2, 1]) : [2, 0, 1]) : e[1]! < e[2]! ? (e[0]! < e[2]! ? [1, 0, 2] : [1, 2, 0]) : [2, 1, 0];
      if (m0 === ord[0]) { tMin[ti0] = ord[1]!; value = e[ord[1]!]!; }
      else if (m0 === ord[1]) { tMin[ti0] = ord[2]!; value = e[ord[2]!]!; }
      else { tMin[ti0] = 3; value = maxError; }
      push(ti0, value);
      continue;
    }
    lastError = value;
    changed.length = 0;
    const end0 = vStart[vi0]! + vCount[vi0]! - 2;
    for (let ei = vStart[vi0]!; ei < end0; ei++) changed.push(eT[ei]!);
    const end1 = vStart[vi1]! + vCount[vi1]! - 2;
    for (let ei = vStart[vi1]!; ei < end1; ei++) {
      const t = eT[ei]!;
      I[t * 3 + eE[ei]!] = vi0;
      changed.push(t);
    }
    vQ.set(qTmp, vi0 * N);
    const viTop0 = I[ti0 * 3 + ((m0 + 2) % 3)]!;
    changeNeighbors(ti0, ti1, vi0, vi1, viTop0);
    V[vi0 * 3] = nx; V[vi0 * 3 + 1] = ny; V[vi0 * 3 + 2] = nz;
    if (hPos[ti1]! >= 0) removeAt(hPos[ti1]!);
    for (const t of changed) {
      setNormal(t);
      update(t, triError(t));
    }
    tN[ti0 * 3] = 3;
    tN[ti1 * 3] = 3;
    actual -= 2;
  }

  // ---- compact
  const newIndex = new Int32Array(nv).fill(-1);
  let vn = 0;
  for (let v = 0; v < nv; v++) if (vCount[v]! > 0) newIndex[v] = vn++;
  const outV = new Float64Array(vn * 3);
  for (let v = 0; v < nv; v++) {
    const k = newIndex[v]!;
    if (k >= 0) { outV[k * 3] = V[v * 3]!; outV[k * 3 + 1] = V[v * 3 + 1]!; outV[k * 3 + 2] = V[v * 3 + 2]!; }
  }
  let tn = 0;
  for (let t = 0; t < nt; t++) if (!deleted(t)) tn++;
  const outI = new Uint32Array(tn * 3);
  const src = new Uint32Array(tn);
  let k = 0;
  for (let t = 0; t < nt; t++) {
    if (deleted(t)) continue;
    outI[k * 3] = newIndex[I[t * 3]!]!; outI[k * 3 + 1] = newIndex[I[t * 3 + 1]!]!; outI[k * 3 + 2] = newIndex[I[t * 3 + 2]!]!;
    src[k++] = t;
  }
  return { vertices: outV, indices: outI, sourceTriangle: src, lastError };
}
