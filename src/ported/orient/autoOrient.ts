// Ported from Bambu Studio — src/libslic3r/Orient.cpp, src/libslic3r/Orient.hpp (OrientParamsArea) @ da8b44e
// Original licence: AGPL-3.0 (https://github.com/bambulab/BambuStudio). Translated to TypeScript for Mesh Studio.
// Changes: works on a world-space triangle soup plus a convex-hull soup supplied by
// the caller (Manifold hull); no Eigen, TBB, logging, cooling-direction search or
// "appearance face" weighting (Mesh Studio has no face types); returns the best
// "up" direction and the ranked candidates instead of writing into OrientMesh.

export interface OrientCost {
  up: [number, number, number];
  overhang: number;
  bottom: number;
  bottomHull: number;
  contour: number;
  areaLaf: number;
  unprintability: number;
}

// OrientParamsArea defaults (min_volume = false branch)
const P = {
  RELATIVE_F: 20,
  CONTOUR_F: 0.5,
  BOTTOM_F: 2.5,
  BOTTOM_HULL_F: 0.1,
  TAR_C: 0.1,
  TAR_D: 1,
  FIRST_LAY_H: 0.2,
  LAF_MAX: 0.999,
  LAF_MIN: 0.97,
  TAR_LAF: 0.001,
  BOTTOM_MIN: 0.1,
  use_low_angle_face: 1,
};
const EPS = 1e-4;

interface Faces {
  n: Float64Array; // unit normals
  area: Float64Array;
  p: Float32Array; // soup
}

function faces(p: Float32Array): Faces {
  const t = p.length / 9;
  const n = new Float64Array(t * 3), area = new Float64Array(t);
  for (let i = 0; i < t; i++) {
    const o = i * 9;
    const ux = p[o + 3]! - p[o]!, uy = p[o + 4]! - p[o + 1]!, uz = p[o + 5]! - p[o + 2]!;
    const vx = p[o + 6]! - p[o]!, vy = p[o + 7]! - p[o + 1]!, vz = p[o + 8]! - p[o + 2]!;
    const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx;
    const l = Math.hypot(x, y, z);
    area[i] = l / 2;
    if (l > 0) { n[i * 3] = x / l; n[i * 3 + 1] = y / l; n[i * 3 + 2] = z / l; }
  }
  return { n, area, p };
}

/** Candidate directions: largest-area quantised normals (accurate variant) of the mesh and its hull. */
function areaCumulationAccurate(f: Faces, count: number, out: number[][]) {
  const groups = new Map<string, { total: number; best: number; n: number[] }>();
  for (let i = 0; i < f.area.length; i++) {
    const nx = f.n[i * 3]!, ny = f.n[i * 3 + 1]!, nz = f.n[i * 3 + 2]!;
    const key = `${Math.floor(nx * 1000)},${Math.floor(ny * 1000)},${Math.floor(nz * 1000)}`;
    const g = groups.get(key) ?? { total: 0, best: 0, n: [nx, ny, nz] };
    g.total += f.area[i]!;
    if (f.area[i]! > g.best) { g.best = f.area[i]!; g.n = [nx, ny, nz]; }
    groups.set(key, g);
  }
  const sorted = [...groups.values()].sort((a, b) => b.total - a.total);
  for (let i = 0; i < Math.min(count, sorted.length); i++) out.push(sorted[i]!.n);
}

const S = Math.SQRT1_2;
const SUPPLEMENTS = [
  [0, 0, -1], [S, 0, -S], [0, S, -S], [-S, 0, -S], [0, -S, -S],
  [1, 0, 0], [S, S, 0], [0, 1, 0], [-S, S, 0], [-1, 0, 0], [-S, -S, 0], [0, -1, 0], [S, -S, 0],
  [S, 0, S], [0, S, S], [-S, 0, S], [0, -S, S], [0, 0, 1],
];

function features(mesh: Faces, hull: Faces, up: number[], ascent: number): Omit<OrientCost, 'up' | 'unprintability'> {
  const [ox, oy, oz] = up as [number, number, number];
  const t = mesh.area.length;
  const zMax = new Float64Array(t), zMean = new Float64Array(t);
  let minZ = Infinity;
  for (let i = 0; i < t; i++) {
    const o = i * 9, p = mesh.p;
    const z0 = p[o]! * ox + p[o + 1]! * oy + p[o + 2]! * oz;
    const z1 = p[o + 3]! * ox + p[o + 4]! * oy + p[o + 5]! * oz;
    const z2 = p[o + 6]! * ox + p[o + 7]! * oy + p[o + 8]! * oz;
    zMax[i] = Math.max(z0, z1, z2);
    zMean[i] = (z0 + z1 + z2) / 3;
    minZ = Math.min(minZ, z0, z1, z2);
  }
  let bottom1 = 0, bottom2 = 0, overhang = 0, areaLaf = 0;
  for (let i = 0; i < t; i++) {
    const a = mesh.area[i]!;
    const isBottom = zMax[i]! < minZ + P.FIRST_LAY_H - EPS;
    const isBottom2 = zMax[i]! < minZ + P.FIRST_LAY_H / 2 - EPS;
    if (isBottom) bottom1 += a;
    if (isBottom2) bottom2 += a;
    const proj = mesh.n[i * 3]! * ox + mesh.n[i * 3 + 1]! * oy + mesh.n[i * 3 + 2]! * oz;
    if (proj < ascent && !isBottom2) overhang += a;
    const pa = Math.abs(proj);
    if (pa < P.LAF_MAX && pa > P.LAF_MIN && zMax[i]! > minZ + P.FIRST_LAY_H) areaLaf += a;
  }
  let bottomHull = 0;
  const h = hull.p;
  for (let i = 0; i < hull.area.length; i++) {
    const o = i * 9;
    const z = Math.max(h[o]! * ox + h[o + 1]! * oy + h[o + 2]! * oz, h[o + 3]! * ox + h[o + 4]! * oy + h[o + 5]! * oz, h[o + 6]! * ox + h[o + 7]! * oy + h[o + 8]! * oz);
    if (z < minZ + P.FIRST_LAY_H - EPS) bottomHull += hull.area[i]!;
  }
  const bottom = bottom1 * 0.5 + bottom2;
  return { overhang, bottom, bottomHull, contour: 4 * Math.sqrt(bottom), areaLaf };
}

function target(c: Omit<OrientCost, 'up' | 'unprintability'>): number {
  let cost =
    (P.RELATIVE_F * (c.overhang * P.TAR_C + P.TAR_D + P.TAR_LAF * c.areaLaf * P.use_low_angle_face)) /
    (P.TAR_D + P.CONTOUR_F * c.contour + P.BOTTOM_F * c.bottom + P.BOTTOM_HULL_F * c.bottomHull);
  if (c.bottom < P.BOTTOM_MIN) cost += 100;
  return cost;
}

/**
 * Best "up" direction for printing (the object is then rotated so this vector
 * points to +Z). `overhangAngle` is measured from horizontal (Bambu's support
 * threshold angle, default 30°).
 */
export function autoOrient(soup: Float32Array, hullSoup: Float32Array, overhangAngle = 30): { best: OrientCost; ranked: OrientCost[] } {
  const mesh = faces(soup);
  const hull = faces(hullSoup);
  const ascent = Math.cos(Math.PI - (overhangAngle * Math.PI) / 180);
  const candidates: number[][] = [[0, 0, -1]];
  areaCumulationAccurate(mesh, 10, candidates);
  areaCumulationAccurate(hull, 14, candidates);
  candidates.push(...SUPPLEMENTS);
  const unique: number[][] = [];
  for (const c of candidates) {
    if (Math.hypot(c[0]!, c[1]!, c[2]!) < 1e-7) continue;
    if (unique.some((u) => Math.abs(u[0]! - c[0]!) + Math.abs(u[1]! - c[1]!) + Math.abs(u[2]! - c[2]!) < 1e-6)) continue;
    unique.push(c);
  }
  const results: OrientCost[] = unique.map((c) => {
    const up: [number, number, number] = [-c[0]!, -c[1]!, -c[2]!];
    const f = features(mesh, hull, up, ascent);
    return { up, ...f, unprintability: target(f) };
  });
  results.sort((a, b) => a.unprintability - b.unprintability);
  let best = results[0]!;
  // prefer the current orientation among equally good ones
  if (Math.abs(best.up[2] - 1) > EPS) {
    for (let i = 1; i < results.length - 1; i++) {
      if (Math.abs(results[i]!.unprintability - results[0]!.unprintability) >= EPS) break;
      if (Math.abs(results[i]!.up[2] - 1) < EPS * EPS) { best = results[i]!; break; }
    }
  }
  return { best, ranked: results };
}
