// Ported from Bambu Studio — src/libslic3r/Model.cpp (ModelObject::get_connector_mesh,
// ModelVolume::apply_tolerance, ModelObject::process_connector_cut), src/libslic3r/TriangleMesh.cpp
// (its_make_cylinder, its_make_cone, its_make_frustum_dowel), src/libslic3r/CutUtils.cpp
// (Cut::perform_with_groove), src/libslic3r/CutUtils.hpp (Groove, CUT_TOLERANCE),
// src/slic3r/GUI/Gizmos/GLGizmoAdvancedCut.cpp (defaults) @ da8b44e
// Original licence: AGPL-3.0 (https://github.com/bambulab/BambuStudio). Translated to TypeScript for Mesh Studio.
// Changes: shapes are described as point clouds / solids for Manifold (hull or
// cylinder) instead of indexed_triangle_set; the circle uses 64 sectors, not 360;
// the groove is built as two solids (half-space + trapezoid prism) instead of
// seven chained plane cuts, giving the same partition; no snap/thread connectors.

export type ConnectorType = 'plug' | 'dowel';
export type ConnectorStyle = 'prism' | 'frustum';
export type ConnectorShape = 'triangle' | 'square' | 'hexagon' | 'circle';

export const CUT_TOLERANCE = 0.1;

/** Sector counts from get_connector_mesh (circle reduced from 360 to 64). */
export const SECTORS: Record<ConnectorShape, number> = { triangle: 3, square: 4, hexagon: 6, circle: 64 };

/** Defaults from GLGizmoAdvancedCut::validate_connector_settings. */
export const CONNECTOR_DEFAULTS = { type: 'plug' as ConnectorType, style: 'prism' as ConnectorStyle, shape: 'circle' as ConnectorShape, size: 2.5 * 2, depth: 3, sizeTolerance: 0, depthTolerance: 0.1 };

export interface ConnectorSolid {
  /** Convex point cloud in the connector frame (z = cut-plane normal, origin on the plane). */
  points: Array<[number, number, number]>;
}

function ring(r: number, z: number, n: number, phase: number): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  for (let i = 0; i < n; i++) {
    const a = phase + (2 * Math.PI * i) / n;
    out.push([r * Math.cos(a), r * Math.sin(a), z]);
  }
  return out;
}

/**
 * Connector solid. Plugs start on the plane and rise `height` along +z (prism =
 * its_make_cylinder, frustum = its_make_cone). Dowels are centred on the plane
 * and reach `height` to each side (prism = cylinder, frustum = its_make_frustum_dowel,
 * a double pyramid/cone with its ring turned by 45°).
 */
export function connectorSolid(type: ConnectorType, style: ConnectorStyle, shape: ConnectorShape, radius: number, height: number, rotation = 0): ConnectorSolid {
  const n = SECTORS[shape];
  // its_make_cylinder starts its ring at (0, r) — i.e. 90°
  const phase = rotation + (style === 'frustum' && type === 'dowel' ? Math.PI / 4 : style === 'prism' ? Math.PI / 2 : 0);
  if (type === 'plug') {
    if (style === 'prism') return { points: [...ring(radius, 0, n, phase), ...ring(radius, height, n, phase)] };
    return { points: [...ring(radius, 0, n, phase), [0, 0, height]] };
  }
  if (style === 'prism') return { points: [...ring(radius, -height, n, phase), ...ring(radius, height, n, phase)] };
  return { points: [[0, 0, height], ...ring(radius, 0, n, phase), [0, 0, -height]] };
}

/**
 * The hole for a connector: ModelVolume::apply_tolerance makes it wider by the
 * radius tolerance and deeper by the height tolerance (keeping the base on the
 * plane for plugs; dowels grow by the tolerance on each side).
 */
export function holeSolid(type: ConnectorType, style: ConnectorStyle, shape: ConnectorShape, radius: number, height: number, radiusTol: number, heightTol: number, rotation = 0): ConnectorSolid {
  const s = connectorSolid(type, style, shape, radius + radiusTol, height + heightTol, rotation);
  if (type === 'plug') {
    // extend slightly below the plane so the hole opens cleanly on the cut face
    s.points = s.points.map(([x, y, z]) => [x, y, z === 0 ? -0.01 : z]);
  }
  return s;
}

/** Groove (dovetail) parameters, as in CutUtils.hpp `Groove`; angles in radians. */
export interface Groove {
  depth: number;
  width: number;
  flapsAngle: number;
  angle: number;
  depthTolerance: number;
  widthTolerance: number;
}

/** Defaults from GLGizmoAdvancedCut (depth from the bounding box, width = 4 × depth, flaps 60°). */
export function grooveDefaults(size: [number, number, number]): Groove {
  const depth = Math.max(1, 0.5 * ((size[0] + size[1] + size[2]) / 30));
  return { depth, width: 4 * depth, flapsAngle: Math.PI / 3, angle: 0, depthTolerance: CUT_TOLERANCE, widthTolerance: CUT_TOLERANCE };
}

/**
 * Cross-section of the groove in the cut frame (x across the groove after
 * rotating by `angle` about z, z along the normal), as in perform_with_groove:
 * the slab |z| < depth/2 is split by two planes tilted by the flaps angle and
 * shifted ±h_side_shift; the middle trapezoid joins the upper part, the flanks
 * the lower part. The tolerance variant is the trapezoid after the three
 * tolerance cuts (raised bottom, narrowed sides).
 * Returns [x, z] corners: bottom-left, bottom-right, top-right, top-left.
 */
export function grooveTrapezoid(g: Groove, withTolerance: boolean, overlapTop = 0): Array<[number, number]> {
  const half = 0.5 * g.depth;
  const hSideShift = 0.5 * (g.width + g.depth / Math.tan(g.flapsAngle));
  const shift = withTolerance ? hSideShift - 0.5 * g.widthTolerance : hSideShift;
  const zb = withTolerance ? -(half - g.depthTolerance) : -half;
  const zt = half + overlapTop;
  const t = 1 / Math.tan(g.flapsAngle);
  // side plane: x = ∓(shift − z / tan(flaps)) → narrow at the top, wide at the bottom (a dovetail)
  const x = (z: number) => shift - z * t;
  return [[-x(zb), zb], [x(zb), zb], [x(zt), zt], [-x(zt), zt]];
}
