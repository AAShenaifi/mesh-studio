// Kernel operations added after Phase 2. Each registers itself with the core.
import type { Vec3 } from 'manifold-3d';
import { KernelError, TOOL_ID, frameZto, fromManifold, keep, registerOp, tagged, toManifold, wasm } from './kernelCore';
import { dominantColor } from './meshOps';
import type { KernelMesh } from './protocol';

const AXIS: Record<'x' | 'y' | 'z', Vec3> = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

export interface DrillArgs {
  mesh: KernelMesh;
  axis: 'x' | 'y' | 'z';
  /** World point the hole axis passes through (its axis coordinate is ignored). */
  center: Vec3;
  diameter: number;
  /** Depth from the entry face; 0 = through. */
  depth: number;
  countersink: boolean;
  paletteSize: number;
}

/** Drills a round (optionally countersunk) hole, entering from the max side of the axis. */
registerOp('drill', (async (a: DrillArgs) => {
  const { Manifold } = await wasm();
  const m = await toManifold(a.mesh);
  const bb = m.boundingBox();
  const i = a.axis === 'x' ? 0 : a.axis === 'y' ? 1 : 2;
  const lo = bb.min[i]!, hi = bb.max[i]!;
  const r = a.diameter / 2;
  const through = a.depth <= 0;
  const len = through ? hi - lo + 2 : a.depth + 1;
  const start = through ? lo - 1 : hi - a.depth; // cylinder runs from start up to start+len along the axis
  const point: Vec3 = [a.center[0], a.center[1], a.center[2]];
  point[i] = start;
  const n = AXIS[a.axis];
  let tool = keep((await tagged(keep(Manifold.cylinder(len, r, r, 48)), TOOL_ID)).transform(frameZto(n, point)));
  if (a.countersink) {
    const top: Vec3 = [a.center[0], a.center[1], a.center[2]];
    top[i] = hi - r - 0.001;
    const cone = keep((await tagged(keep(Manifold.cylinder(r + 0.02, r, r * 2, 48)), TOOL_ID)).transform(frameZto(n, top)));
    tool = keep(tool.add(cone));
  }
  const out = keep(m.subtract(tool));
  if (Math.abs(out.volume() - m.volume()) < 1e-6) throw new KernelError('The hole misses the object. Move it onto the object.');
  const cap = dominantColor(a.mesh.faceColors);
  return { mesh: fromManifold(out, (id) => (id < a.paletteSize ? id : cap)) };
}) as never);

// ---------------------------------------------------------------- Phase 4

export interface BooleanArgs {
  meshes: KernelMesh[];
  op: 'union' | 'subtract' | 'intersect';
  paletteSize: number;
}

/** Union / subtract (first minus the rest) / intersect. Face colours of every input survive. */
registerOp('boolean', (async (a: BooleanArgs) => {
  const { Manifold } = await wasm();
  if (a.meshes.length < 2) throw new KernelError('Select at least two objects.');
  const ms = [];
  for (let i = 0; i < a.meshes.length; i++) ms.push(await toManifold(a.meshes[i]!, `Object ${i + 1}`));
  const out = keep(a.op === 'union' ? Manifold.union(ms) : a.op === 'subtract' ? Manifold.difference(ms) : Manifold.intersection(ms));
  if (out.isEmpty()) throw new KernelError(a.op === 'intersect' ? 'The objects do not overlap, so the intersection is empty.' : 'The result is empty.');
  const fallback = dominantColor(a.meshes[0]!.faceColors);
  return { mesh: fromManifold(out, (id) => (id < a.paletteSize ? id : fallback)), volume: out.volume() };
}) as never);

export interface PrimitiveArgs {
  kind: 'box' | 'cylinder' | 'sphere' | 'cone';
  size: Vec3; // box: x y z; cylinder/cone: diameter, diameter(top for cone), height; sphere: diameter
  segments: number;
  color: number;
}

/** Watertight primitives standing on z = 0, centred on the origin. */
registerOp('primitive', (async (a: PrimitiveArgs) => {
  const { Manifold } = await wasm();
  let m;
  if (a.kind === 'box') m = keep(Manifold.cube(a.size, true)).translate([0, 0, a.size[2] / 2]);
  else if (a.kind === 'sphere') m = keep(Manifold.sphere(a.size[0] / 2, a.segments)).translate([0, 0, a.size[0] / 2]);
  else if (a.kind === 'cone') m = keep(Manifold.cylinder(a.size[2], a.size[0] / 2, a.size[1] / 2, a.segments));
  else m = keep(Manifold.cylinder(a.size[2], a.size[0] / 2, a.size[0] / 2, a.segments));
  keep(m);
  return { mesh: fromManifold(m, () => a.color) };
}) as never);

export interface HollowArgs {
  mesh: KernelMesh;
  thickness: number;
  /** Grid edge for the inner surface (mm); 0 = automatic. */
  resolution: number;
  drain: { diameter: number } | null;
  paletteSize: number;
}

/**
 * Hollows a watertight mesh with a constant wall: the cavity is the level set
 * {signed distance ≥ thickness} of the original, extracted with Manifold's
 * levelSet over a BVH-accelerated SDF, then subtracted.
 */
registerOp('hollow', (async (a: HollowArgs) => {
  const { Manifold } = await wasm();
  const { BufferAttribute, BufferGeometry, Ray, Vector3, DoubleSide } = await import('three');
  const { MeshBVH } = await import('three-mesh-bvh');
  const outer = await toManifold(a.mesh);
  const bb = outer.boundingBox();
  const size = [bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]];
  if (Math.min(...size) <= a.thickness * 2) throw new KernelError(`The object is too thin to hollow with ${a.thickness} mm walls.`);
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(a.mesh.positions.slice(), 3));
  const bvh = new MeshBVH(geo);
  const p = new Vector3();
  const hit = { point: new Vector3(), distance: 0, faceIndex: 0 };
  const ray = new Ray(new Vector3(), new Vector3(1, 0.000123, 0.000317).normalize());
  const t = a.thickness;
  const far = t * 4;
  const sdf = (v: Vec3) => {
    p.set(v[0], v[1], v[2]);
    const found = bvh.closestPointToPoint(p, hit as never, 0, far);
    const d = found ? hit.distance : far;
    // Closer than the wall thickness the sign never matters: the value stays under the level either way.
    if (d < t * 0.98) return d;
    ray.origin.copy(p);
    const inside = bvh.raycast(ray, DoubleSide).length % 2 === 1;
    return inside ? d : -d;
  };
  const auto = Math.max(Math.max(...size) / 120, t / 2.5, 0.3);
  const edge = a.resolution > 0 ? a.resolution : auto;
  const pad = edge * 2;
  const inner = keep(Manifold.levelSet(sdf, { min: [bb.min[0] - pad, bb.min[1] - pad, bb.min[2] - pad], max: [bb.max[0] + pad, bb.max[1] + pad, bb.max[2] + pad] }, edge, t));
  geo.dispose();
  if (inner.isEmpty()) throw new KernelError('No room for a cavity with this wall thickness.');
  let shell = keep(outer.subtract(await tagged(inner, TOOL_ID)));
  if (a.drain) {
    const r = a.drain.diameter / 2;
    const c: Vec3 = [(bb.min[0] + bb.max[0]) / 2, (bb.min[1] + bb.max[1]) / 2, bb.min[2] - 1];
    const hole = keep((await tagged(keep(Manifold.cylinder(t * 3 + 2, r, r, 32)), TOOL_ID)).translate(c));
    shell = keep(shell.subtract(hole));
  }
  const cap = dominantColor(a.mesh.faceColors);
  return { mesh: fromManifold(shell, (id) => (id < a.paletteSize ? id : cap)), volume: shell.volume(), cavity: inner.volume(), edge };
}) as never);

// ---------------------------------------------------------------- Phase 6

export interface Extrude2DArgs {
  /** Each region: closed contours (outer + holes) combined with its fill rule; regions are unioned. */
  regions: Array<{ contours: Array<Array<[number, number]>>; fillRule: 'EvenOdd' | 'NonZero' }>;
  depth: number;
  /** Uniform XY scale applied before extruding, plus a Y flip for image/SVG coordinates. */
  scale: number;
  flipY: boolean;
  color: number;
  /** Clean-up: drop islands smaller than this area (mm²). */
  minArea: number;
}

/** 2D outlines → watertight solid of the given depth, standing on z = 0, centred on the origin. */
registerOp('extrude2d', (async (a: Extrude2DArgs) => {
  const { CrossSection, Manifold } = await wasm();
  const sections = [];
  for (const r of a.regions) {
    const contours = r.contours
      .filter((c) => c.length >= 3)
      .map((c) => c.map(([x, y]) => [x * a.scale, (a.flipY ? -y : y) * a.scale] as [number, number]));
    if (!contours.length) continue;
    // A Y flip reverses winding; NonZero needs consistent orientation, EvenOdd does not care.
    const cs = new CrossSection(contours, r.fillRule === 'NonZero' && a.flipY ? 'Negative' : r.fillRule === 'NonZero' ? 'Positive' : 'EvenOdd');
    sections.push(cs);
  }
  if (!sections.length) throw new KernelError('No closed shapes found to extrude.');
  let shape = CrossSection.union(sections);
  sections.forEach((s) => s.delete());
  if (a.minArea > 0) {
    const parts = shape.decompose().filter((p) => {
      const keepIt = p.area() >= a.minArea;
      if (!keepIt) p.delete();
      return keepIt;
    });
    shape.delete();
    shape = CrossSection.union(parts);
    parts.forEach((p) => p.delete());
  }
  if (shape.isEmpty()) {
    shape.delete();
    throw new KernelError('The shapes are empty after cleaning (all smaller than the minimum island size).');
  }
  const b = shape.bounds();
  const centred = shape.translate([-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2]);
  shape.delete();
  const solid = keep(Manifold.extrude(centred, a.depth));
  const area = centred.area();
  centred.delete();
  return { mesh: fromManifold(solid, () => a.color), area, size: [b.max[0] - b.min[0], b.max[1] - b.min[1]] };
}) as never);
