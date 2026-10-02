# Ported code register

Code translated from PrusaSlicer or Bambu Studio (C++ → TypeScript) lives in
`src/ported/<feature>/`. Every file there starts with this header:

```ts
// Ported from <PrusaSlicer|Bambu Studio> — <path/in/that/repo> @ <commit>
// Original licence: AGPL-3.0 (<repo URL>). Translated to TypeScript for Mesh Studio.
// Changes: <short list>
```

Rules: code and algorithms only. No fonts, icons, printer/filament profiles or
other slicer assets. Nothing from Microsoft 3D Builder (closed source): its
features are reimplemented from observed behaviour and are not listed here.
To remove all ported code: delete `src/ported/` and the imports that reference it
(each is listed below).

| Feature | Source project | Source file(s) @ commit | Licence | Mesh Studio files | What changed |
| --- | --- | --- | --- | --- | --- |
| Simplify (quadric edge collapse) | Bambu Studio | `src/libslic3r/QuadricEdgeCollapse.cpp` @ da8b44e | AGPL-3.0 | `src/ported/simplify/quadricEdgeCollapse.ts`; used by `src/geometry/kernelOpsPrep.ts` (op `simplify`) | Flat typed arrays; binary heap instead of MutablePriorityQueue; a vertex's triangle list is relocated (with periodic compaction) instead of shifting later vertices; no TBB/cancel/progress; returns the source triangle of each output triangle so face colours survive. |
| Auto orient for printing | Bambu Studio | `src/libslic3r/Orient.cpp`, `Orient.hpp` (`OrientParamsArea`) @ da8b44e | AGPL-3.0 | `src/ported/orient/autoOrient.ts`; used by `kernelOpsPrep.ts` (op `orient`) and `features/meshTools/ops.ts` | Same candidate directions (area clusters of mesh + convex hull, 18 supplements) and cost function (`min_volume = false` branch); hull comes from Manifold; no cooling-direction search, no appearance-face weighting, no Eigen/TBB. After orienting, Mesh Studio also squares the footprint (its own code). |
| Cut connectors (plug / dowel, prism / frustum, triangle / square / hexagon / circle, size and depth tolerances) and dovetail (groove) cut | Bambu Studio | `src/libslic3r/Model.cpp` (`get_connector_mesh`, `ModelVolume::apply_tolerance`, `process_connector_cut`), `src/libslic3r/TriangleMesh.cpp` (`its_make_cylinder`, `its_make_cone`, `its_make_frustum_dowel`), `src/libslic3r/CutUtils.cpp` (`Cut::perform_with_groove`), `CutUtils.hpp` (`Groove`, `CUT_TOLERANCE`), `src/slic3r/GUI/Gizmos/GLGizmoAdvancedCut.cpp` (defaults) @ da8b44e | AGPL-3.0 | `src/ported/cut/connectors.ts`; used by `src/geometry/kernelCore.ts` (op `cut`), `features/cut/*` | Shapes become convex point clouds hulled by Manifold; circle uses 64 sectors instead of 360; the groove is two solids (half-space + trapezoid prism) instead of seven chained plane cuts (same partition, tolerances applied the same way); no snap or thread connectors; dowel holes get the depth tolerance on each side. Click placement, clipping preview and automatic placement are Mesh Studio's own. The snap-fit connector is Mesh Studio's own design (not ported). |
| Painted 3MF for Bambu Studio / PrusaSlicer (per-triangle filament codes) | Bambu Studio | `src/libslic3r/TriangleSelector.cpp` (`serialize`, `deserialize`, `read_paint_nibble`), `src/libslic3r/Model.cpp` (`FacetsAnnotation::get_triangle_as_string` / `set_triangle_from_string`); attribute and config file names from `src/libslic3r/Format/bbs_3mf.cpp` @ da8b44e | AGPL-3.0 | `src/ported/threemf/paintEncoding.ts`; used by `src/features/formats/threemf.ts` | Encodes whole triangles only (Mesh Studio has one colour per triangle); decoding walks the split tree without rebuilding sub-triangles and keeps the state covering the largest share. Writer, filament-slot mapping, colour metadata and config parsing (`project_settings.config`, `model_settings.config`, `Slic3r_PE.config`, `Slic3r_PE_model.config`) are Mesh Studio's own. |
| Feature measure: plane grouping, border walk, circle / polygon / edge detection, feature under the cursor | Bambu Studio | `src/libslic3r/Measure.cpp` (`update_planes`, `extract_features`, `get_feature`, `get_center_and_radius`), `src/libslic3r/Geometry/Circle.cpp` (`circle_ransac`, `circle_center`) @ da8b44e | AGPL-3.0 | `src/ported/measure/features.ts`; used by `src/features/measure/featureMeasure.ts`, `MeasureTool.tsx` | Welded soup + edge-neighbour array instead of SurfaceMesh; borders chained from directed border edges; deterministic RANSAC samples; hover limit is a parameter (adjustable snap radius); edge-end snapping can be switched off. Curved-wall (cylinder) fitting is Mesh Studio's own. The distance/angle maths between two features and the UI are Mesh Studio's own (not ported from `get_measurement`). |

Source revisions studied for the gap analysis: PrusaSlicer `30ef591`
(master), Bambu Studio `da8b44e` (master).
