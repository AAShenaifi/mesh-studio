# Mesh Studio feature gap analysis

Compared against **Bambu Studio** (bambulab/BambuStudio, master),
**PrusaSlicer** (prusa3d/PrusaSlicer, master) and **Microsoft 3D Builder**,
for model prep and cutting only. Slicing, G-code, printer profiles and
supports are out of scope (Mesh Studio does not slice).

Legend: **Has** = equivalent or better · **Partial** = exists but weaker ·
**Missing** = not in Mesh Studio · — = the reference app does not have it.
"Source" names the best file to port from (or "reimplement" for 3D Builder,
which is closed source and is only matched by observed behaviour).

Licences: PrusaSlicer and Bambu Studio are AGPL-3.0 (repo-level LICENSE; the
files carry no per-file notice). Bundled libraries keep their own licences:
admesh GPL-2.0-or-later, libnest2d LGPL-3.0, mcut LGPL-3.0/GPL, earcut ISC.
Ported code goes to `src/ported/<feature>/` and is listed in `PORTED.md`.

Note on AGPL §13: Mesh Studio is reachable at mesh.aashenaifi.com. Anyone
who can use it over the network is entitled to its source; a public repo (or a
"Source" link in the app) satisfies that. Worth adding the link once the first
port lands.

## 1. Import / export

| Feature | Bambu | Prusa | 3D Builder | Mesh Studio |
| --- | --- | --- | --- | --- |
| STL, OBJ, 3MF, STEP | Has | Has | STL/OBJ/3MF (no STEP) | **Has** |
| GLB/glTF, SVG, PNG/JPG image extrude | SVG | SVG | image, no SVG | **Has** (image dialog is 3D Builder-style) |
| AMF, PLY, VRML import | AMF | AMF | PLY, VRML | **Has** AMF + PLY ✅ (VRML not planned) |
| Read Bambu/Prusa multi-colour painting from 3MF (`paint_color` / `slic3rpe:mmu_segmentation`) | Has | Has | — | **Has** ✅ (filament colours + object extruders read; subdivided painting → dominant colour per triangle) |
| Write painted 3MF that Bambu Studio / PrusaSlicer open with the painting intact | Has | Has | — | **Has** ✅ (default 3MF format; colour → filament slot, listed in the export dialog) |
| Per-object extruder/filament assignment in 3MF | Has | Has | — | **Has** ✅ (through painting: every triangle carries its slot) |

## 2. Cutting

| Feature | Bambu | Prusa | 3D Builder | Mesh Studio |
| --- | --- | --- | --- | --- |
| Plane cut, gizmo, tilt, keep both halves | Has | Has | Has (Split) | **Has** |
| Place halves on cut face / flip | Has | Has | — | **Has** (lay flat) |
| Keep upper / lower only, or discard one | Has | Has | Has | **Has** ✅ |
| Connectors: **plug** (male on one half, socket on the other) | Has | Has | — | **Has** ✅ |
| Connectors: **dowel** (holes in both + separate pin) | Has | Has | — | **Has** ✅ (all shapes) |
| Connector shapes: prism / frustum, triangle / square / hexagon / circle | Has | Has | — | **Has** ✅ |
| Click on the cut face to place each connector, per-connector size | Has | Has | — | **Has** ✅ (click placement, upper half clipped while placing; one size for all) |
| Connector tolerance / depth ratio / snap (flexible) connectors | Has | Has | — | **Has** size + depth tolerance ✅; snap connectors not done |
| **Dovetail** cut (groove in one half, tongue in the other) | Has | Has | — | **Has** ✅ |
| Cut by drawn line (draw a line on screen → plane) | Has | Has | — | **Has** ✅ |
| Cut into many slabs at once (multiple parallel cuts) | — | — | — | **Has** ✅ |

## 3. Repair and mesh quality

| Feature | Bambu | Prusa | 3D Builder | Mesh Studio |
| --- | --- | --- | --- | --- |
| Watertight / open / non-manifold edge report | Has | Has | Has | **Has** |
| Fill holes, weld, drop degenerate faces | Has (admesh) | Has (admesh) | Has | **Has** |
| Fix flipped normals (consistent orientation) | Has (admesh `normals.cpp`) | Has | Has | **Has** ✅ (reimplemented, cavities kept inward) |
| Remove self-intersections / merge overlapping shells | Partial (Windows only) | Partial (Windows only) | Has | **Has** overlapping shells ✅ (a single self-intersecting shell is still not fixed) |
| **Simplify** (decimate, keep shape) | Has (QEM) | Has (QEM) | Has | **Has** ✅ (QEM port) |
| Smooth / subdivide | — | — | Has (Smooth) | **Has** ✅ |

## 4. Placement and orientation

| Feature | Bambu | Prusa | 3D Builder | Mesh Studio |
| --- | --- | --- | --- | --- |
| Lay on face (click) | Has | Has | Has | **Has** |
| **Auto-orient by printability** (minimise overhang / support area) | Has (`Orient.cpp`) | Has (SLA) | — | **Has** ✅ (Orient.cpp port) |
| **Arrange / pack** objects with spacing | Has (libnest2d) | Has (new arrange) | — | **Has** ✅ (bounding rectangles) |
| Instances (copies sharing one mesh) | Has | Has | — | **Partial** (duplicate copies the mesh) |
| Align objects (left/centre/distribute) | Has (`GLGizmoAlignment`) | — | Has | **Has** ✅ |
| Assembly view / exploded parts | Has (`GLGizmoAssembly`) | — | — | **Missing** (low value) |

## 5. Analysis and measuring

| Feature | Bambu | Prusa | 3D Builder | Mesh Studio |
| --- | --- | --- | --- | --- |
| Size, volume, weight estimate | Has | Has | Has | **Has** |
| Point-to-point measure | Has | Has | — | **Has** |
| **Feature measure** (plane, edge, circle centre/radius, angle, snapping) | Has (`Measure.cpp`) | Has | — | **Has** ✅ |
| **Overhang visualisation** (faces steeper than X° shaded) | Has | Has | — | **Has** ✅ |
| Thin-wall / thickness check | — | — | Has (basic) | **Has** ✅ |

## 6. Text, emboss, painting

| Feature | Bambu | Prusa | 3D Builder | Mesh Studio |
| --- | --- | --- | --- | --- |
| Text on flat top (engrave / emboss) | Has | Has | Has | **Has** (OpenSCAD; Arabic ok) |
| **Text / SVG projected onto curved surfaces**, placed by click | Has (`GLGizmoText`, `GLGizmoSVG`) | Has (Emboss) | Has (Emboss) | **Has** ✅ (reimplemented; own colour) |
| Colour painting: brush, bucket/smart fill | Has | Has | Has | **Has** |
| Paint by height range, gap fill, triangle subdivision while painting | Has | Has | — | **Partial**: height range ✅; no subdivision (per whole triangle) |
| Fuzzy-skin / seam / support painting | Has | Has | — | — (slicer-only; out of scope) |

## 7. Modelling helpers

| Feature | Bambu | Prusa | 3D Builder | Mesh Studio |
| --- | --- | --- | --- | --- |
| Booleans, hollow, primitives | Has | Has | Has | **Has** |
| **Split into connected parts** (one object per shell) | Has | Has | Has | **Has** ✅ |
| Merge without boolean (group as parts) | Has | Has | Has (Merge) | **Has** ✅ |
| **Extrude down** (extend the bottom to the plate) | — | — | Has | **Has** ✅ |
| **Brim/mouse ears** as geometry | Has (`GLGizmoBrimEars`, slicer feature) | — | — | **Has** ✅ (automatic at sharp corners) |
| Negative volumes / modifiers kept as parts | Has | Has | — | **Partial** (booleans are applied, not kept) |

## Top 10 missing features (model prep and cutting)

Ranked by value for your workflow (prepare → cut → paint → print on Bambu)
against effort. Effort: **S** about a day of work, **M** a few days, **L** a week or more.

| # | Feature | Value | Effort | Port from | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | **Split into connected parts** | High | S | Prusa `MeshSplitImpl.hpp` (algorithm) | Union-find already exists in our analysis; mostly UI. Pairs with cuts and repair. |
| 2 | **Bambu/Prusa-compatible painted 3MF** (export, then import) | Very high | M | Bambu `TriangleSelector.cpp` (serialise/deserialise), `Format/3mf.cpp` (`paint_color`, filament ids) | Paint in Mesh Studio, open in Bambu Studio with colours already assigned to AMS slots. Export first (whole-triangle states only); importing subdivided painting needs the full tree decoder. |
| 3 | **Cut connectors: plugs, shapes, click placement, tolerance** | Very high | M | Bambu `GLGizmoAdvancedCut.cpp` + `CutUtils.cpp` (connector geometry, plug/socket offsets) | Our cut is already Manifold-based; this adds the connector meshes and placement UI. |
| 4 | **Dovetail cut** | High | M | Bambu/Prusa cut gizmo (groove parameters and mesh) | Builds on #3; strong for large prints split into pieces. |
| 5 | **Simplify (decimate)** | High | M | Bambu `QuadricEdgeCollapse.cpp` | Big STEP/scan meshes become editable; also speeds booleans. Run in the kernel worker. |
| 6 | **Auto-orient by overhang + overhang shading** | High | M | Bambu `Orient.cpp` | Shading is a small shader (S); the orient search is the M part. |
| 7 | **Normal fixing + self-intersection cleanup** in Repair | High | M | admesh `normals.cpp` (GPL-2.0+) for orientation; self-intersections via Manifold union of shells (reimplement) | Fixes downloaded models that our current repair leaves non-manifold. |
| 8 | **Text / SVG on curved surfaces** | Medium-high | L | Prusa `Emboss.cpp` / Bambu `GLGizmoText.cpp` | Largest item; needs font outlines in TS (we would use local font files, not slicer assets). |
| 9 | **Feature measure** (planes, circles, angles, snapping) | Medium | M | Bambu/Prusa `Measure.cpp` | Useful for checking hole sizes after cuts. |
| 10 | **Arrange / pack** with spacing | Medium | M | libnest2d is LGPL; Bambu `Arrange.cpp` is AGPL. Simpler: reimplement a bottom-left bounding-box packer | Free workspace makes this less critical, but helps before export to a plate. |

Quick wins outside the top 10 (S each, reimplement): Extrude down
(3D Builder behaviour), Smooth via Manifold `smoothOut`, Keep upper/lower
in Cut, Align objects, overhang shading on its own, brim ears as geometry.

**Suggested first batch:** #1 + #3 + #2. They complete the cut → split →
paint → Bambu print loop and reuse most of what already exists.

## Status (implemented on `claude/youthful-lovelace-5sp3bv`)

All ten items and every quick win are built and tested (`tests/e2e/phase10.mjs` … `phase15.mjs`, 100 checks):

| # | Feature | Status | How |
| --- | --- | --- | --- |
| 1 | Split into connected parts | ✅ | reimplemented (cavity shells stay with their part) |
| 2 | Painted 3MF export + import | ✅ | TriangleSelector encoding ported; writer/reader own |
| 3 | Cut connectors | ✅ | Bambu connector geometry + tolerances ported; click placement own |
| 4 | Dovetail cut | ✅ | Bambu groove geometry ported |
| 5 | Simplify | ✅ | `QuadricEdgeCollapse.cpp` ported (1M → 100k triangles in ≈ 5.5 s) |
| 6 | Auto orient + overhang shading | ✅ | `Orient.cpp` ported; shading own |
| 7 | Fix normals + merge overlapping shells | ✅ | reimplemented |
| 8 | Text / SVG on curved surfaces | ✅ | reimplemented (drape along the click normal) |
| 9 | Feature measure | ✅ | `Measure.cpp` feature extraction ported; maths own |
| 10 | Arrange / align / distribute | ✅ | reimplemented (skyline packing of bounding rectangles) |

Quick wins done: extrude down, smooth, keep upper/lower, align, overhang shading,
brim ears; also PLY/AMF import, paint by height, wall-thickness check, cut by a
drawn line, slab cuts, merge without boolean.

Added after owner feedback: linear / grid / circular patterns, object snapping
while moving (touching, flush, centred, onto the grid) with adjustable snap
steps and distance, measure snap switches and radius, face ↔ face measuring,
STEP (solid B-rep), OpenSCAD, PLY and AMF export.

### Closed after the second review

| Was missing | Now |
| --- | --- |
| Snap / flexible cut connectors | ✅ Snap connector: slotted barbed plug + grooved socket (own design) |
| Painting with triangle subdivision | ✅ "Refine for painting" splits big triangles to a chosen edge length so borders are fine (whole-triangle painting on the refined mesh) |
| Linked instances | ✅ Linked copies (pattern option): shared mesh, painting one paints all, Unlink |
| Modifier / negative volumes kept as parts | ✅ Negative parts: kept as objects, cut out on export or with Apply |
| Assembly / exploded view | ✅ Exploded-view slider (display only) |
| Fixing one self-intersecting shell | ✅ Rebuild as solid (signed distance + level set; fixes self-intersections, overlaps and small gaps) |
| Curved-wall radius measuring | ✅ Clicking a hole wall, cylinder or fillet gives its diameter, radius, axis and length |
| STEP export with fewer faces | ✅ Coplanar triangles merged into planar faces with holes (a box is 6 faces) |
| Snapping onto another object's faces | ✅ "Place on a face of another object" (plus box snapping while dragging) |
| VRML import | ✅ |
| LazyFabrication generators | ✅ All 25 live ones and about 50 of their planned ones, as 77 new OpenSCAD generators (91 in total), plus laser SVG / DXF output |

### Still missing, and why

| Missing | Why |
| --- | --- |
| STEP export with true curved surfaces (cylinders as cylinders) | A mesh has no curves left to export. LazyFabrication builds its parts with a CAD kernel (replicad / OpenCascade) and can write real curves; Mesh Studio's generators use OpenSCAD, which only outputs meshes. It would need every generator rewritten for a CAD kernel. |
| Per-stroke subdivision while painting (only the area under the brush is split, as in the slicers) | "Refine for painting" splits the whole object instead; the result is the same but the mesh gets larger. |
| Negative / modifier volumes inside the exported Bambu 3MF (editable in Bambu Studio) | They are subtracted before export; Bambu's private volume-type metadata is not written yet. |
| Snapping to other objects' faces and edges while dragging (not just their bounding boxes) | Box snapping plus "place on face" cover most cases. |
| LazyFabrication's Laser catalogue | Its list was not in the saved page; three laser generators exist so far. |
