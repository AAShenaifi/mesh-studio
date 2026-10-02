# Mesh Studio roadmap

Single source of truth for progress. A fresh session should be able to resume
from this file alone. Branch: `claude/youthful-lovelace-5sp3bv` (never `main`,
no PR). Each finished phase is tagged `phase-<n>` on its last commit. The sandbox git
proxy rejects tag pushes (HTTP 403), so tags exist locally only; the commit for
each tag is listed in the Tags table below — recreate with `git tag <name> <sha>`.

## Ground rules (from the owner)
- Work only in `apps/mesh-studio/` plus: root `_headers` (isolation rule),
  `stl-studio/index.html` (ONE change: top tab strip linking to Mesh Studio),
  and in Phase 8 the hub card in `config.js`. Nothing else in the repo changes.
- Cross-platform npm scripts only (owner runs Windows 11, Node 24).
- No CDN assets. COEP `require-corp` must keep working on `/mesh-studio/*`.
- Original code, plus code ported from PrusaSlicer / Bambu Studio (AGPL-3.0) since the owner allowed it:
  only in `src/ported/<feature>/`, each file with a source header, every port listed in `PORTED.md`.
  Nothing from 3D Builder (closed source; behaviour reimplemented). No slicer assets. npm libraries are fine.
- No large binaries committed; the built app in `/mesh-studio/` is the approved exception (see DEPLOY.md).
- Per phase: implement → `npm run typecheck` + `npm run build` → headless
  Chromium tests (`tests/e2e/*.mjs`, screenshots + assertions) → fix → commit →
  push → tag → update this file.

## How to resume
```bash
cd apps/mesh-studio && npm install
npm run build && npm run preview &        # http://localhost:4173/mesh-studio/
node tests/e2e/run-all.mjs http://localhost:4173/mesh-studio/
```
Tests use Playwright from the cloud image (`/opt/node22/lib/node_modules/playwright`);
override with `PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs`.

## Architecture decisions (made autonomously, recorded here)
1. **Scene is always Z-up internally.** The Up-axis setting now means "the
   convention STL/OBJ files are authored in" (applied on import) and the default
   for export. Grid always lies in XY. Reason: every tool (cut planes, drop to
   grid, painting, booleans) works in one frame; no dual code paths.
2. **One mesh per object**, non-indexed `BufferGeometry` in local millimetres,
   plus `faceColors: Uint16Array` (palette index per triangle). A global
   palette (index 0 = default colour) drives rendering, painting, 3MF colours
   and split-by-colour. glTF/OBJ material colours are baked into the palette;
   textures are dropped (mesh-prep tool, not a renderer).
3. **Immutable object records + snapshot undo.** Every edit replaces object
   records; history stores arrays of records (structural sharing). Geometries
   that leave both scene and history are disposed.
4. **manifold-3d in a module Web Worker** for cuts, booleans, repair, hollow,
   primitives and 2D extrusion. Colours survive operations through Manifold's
   `faceID` (= palette index).
5. **STEP: `occt-import-js` instead of `opencascade.js`.** Both are OpenCascade
   compiled to Wasm, but opencascade.js ships a single 66 MB `.wasm`, over the
   Cloudflare Pages 25 MiB per-file limit, so it cannot be deployed.
   occt-import-js is 7.6 MB, LGPL-2.1, reads STEP/IGES/BREP with tessellation
   parameters, loaded lazily in a worker.
6. **OpenSCAD engine for generators and text** (STL Studio parity): Mesh
   Studio has its own worker but loads the existing OpenSCAD Wasm build and
   font/library pack from `/stl-studio/assets/` (same origin, not duplicated).
   When STL Studio is retired those assets must be kept or moved.
7. **Dev/preview serve the whole repo** (Vite plugin) so `/stl-studio/` and the
   hub work locally; COOP/COEP are added only to `/mesh-studio/*`, mirroring
   production `_headers`.

## Tags

| Tag | Commit |
| --- | --- |
| phase-1 | 621efda |
| phase-1-5 | eca1f74 |
| phase-2 | 6f2ca12 |
| phase-3 | 266509a |
| phase-4 | ecc28c8 |
| phase-5 | fefe556 |
| phase-6 | cef9472 |
| phase-7 | 5b63dbb |
| phase-8 | f205545 |

## Known limitations
- Generators/text: the Cairo and Noto Emoji fonts are not in STL Studio's
  font pack (it downloaded them from GitHub at runtime). Mesh Studio may not
  fetch from other origins, so those choices fall back to Liberation Sans;
  emoji/symbols in the Dual-Letter generator may render empty.
- Text engraving and OpenSCAD tools return a single-colour mesh.
- 3MF: the default export writes Bambu/Prusa painting (`paint_color`,
  `slic3rpe:mmu_segmentation`, whole triangles); the standard basematerials 3MF
  is the second format. Imported painting that was subdivided in a slicer keeps
  only the dominant colour of each original triangle.
- Not built: snap/threaded connectors, painting with triangle subdivision,
  linked instances, kept modifier volumes, fixing a single self-intersecting shell.
- The AI designer needs the deployed `/api/stl-ai` function; locally it shows
  "service not available". Tests use a mocked stream.

## Status: all phases complete

Next steps for the owner: run it on Windows, then deploy (README → "Deploying").
Possible follow-ups: responsive layout for phones, Bambu/Prusa multi-material
3MF attributes, local Cairo/emoji fonts for OpenSCAD text, BVH build in a worker.

## Phases

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Shell, viewport, settings, STL/OBJ/glTF/GLB loading | ✅ done (tag `phase-1`) |
| 1.5 | Object tools: multi-object, list, selection, gizmo W/E/R, numeric transform, drop/center, undo/redo, duplicate, delete; app tab strip (Mesh Studio ↔ STL Studio) | ✅ done (tag `phase-1-5`) |
| 2 | Manifold worker, plane cut/split + gizmo + pins, analysis, repair, export dialog (STL bin/ASCII, OBJ+MTL, GLB), round-trip tests | ✅ done (tag `phase-2`) |
| 3 | Port STL Studio: tools, generators (OpenSCAD), stats, export (.scad, PNG), AI designer | ✅ done (tag `phase-3`) |
| 4 | Booleans (union/subtract/intersect), hollow, primitives | ✅ done (tag `phase-4`) |
| 5 | Painting (brush, bucket, undo), colours through cuts, split by colour, scale to size, orientation helpers | ✅ done (tag `phase-5`) |
| 6 | 3MF import/export with colours (jszip), SVG & PNG extrusion | ✅ done (tag `phase-6`) |
| 7 | STEP import (OpenCascade Wasm via occt-import-js, lazy, quality setting) | ✅ done (tag `phase-7`) |
| 8 | Polish: shortcuts panel, errors, 1M-triangle performance, README, hub card, deploy steps; STL Studio parity extras (edges, measure) | ✅ done (tag `phase-8`) |

## Post-phase features

| Feature | Status |
| --- | --- |
| Image import dialog (3D Builder style): live overlay, Levels/Invert/Smooth, Contour or Relief, Depth, Width, colour, Textures, worker-run 3D preview, Cancel/Import, re-tune from Create tab, downscaled preview + full-resolution import | ✅ done |
| Gap analysis vs Bambu Studio / PrusaSlicer / 3D Builder (`GAP_ANALYSIS.md`) | ✅ done |
| Gap batch 1: split into parts, merge without boolean, keep one cut half, simplify (QEM port), smooth, extrude down, brim ears, fix normals, merge overlapping shells, auto orient (Orient.cpp port), overhang shading, arrange / align / distribute | ✅ done |
| Gap batch 2: cut connectors (plug/dowel, prism/frustum, 4 shapes, tolerances, click placement) and dovetail cut (ports) | ✅ done |
| Gap batch 3: painted 3MF for Bambu Studio / PrusaSlicer, export and import (TriangleSelector encoding port) | ✅ done |
| Gap batch 4: feature measure (Measure.cpp feature extraction port) | ✅ done |
| Gap batch 5: text / SVG projected onto curved surfaces by clicking | ✅ done |
| Measure upgrade: hover preview, snapping (corners, edge midpoints, hole centres, edges; Shift = free point, Alt = face), edge length, Ø/R, face area, angle arcs, concentricity, copyable values | ✅ done |
| Second review: 77 new generators (91 total, search/categories/favourites, laser category), VRML import, exploded view, place on face, curved-wall radius, snap connectors, rebuild as solid, negative parts, linked copies, refine for painting, STEP planar-face merging, laser SVG/DXF | ✅ done |
| Owner feedback: patterns (linear/grid/circular), object snapping while moving, adjustable snap steps, measure snap switches/radius, face ↔ face measure, STEP/SCAD/PLY/AMF export | ✅ done |
| Gap batch 6: PLY/AMF import, paint by height, wall-thickness check, slab cuts, cut by drawn line, licence/source note | ✅ done |

## Deployment

Live via committed build output in `/mesh-studio/` (see DEPLOY.md); hub service
worker made network-first for Mesh Studio pages. Checked with
`tests/e2e/static-site.mjs` + `tests/e2e/deploy.mjs` (26 checks).

## Test log (one line per phase)
- Phase 1: 20 headless checks (dev + preview): isolation, STL bin/ASCII, OBJ, GLB, glTF+bin, 4 error cases, units, Y-up, settings persistence/corruption.
- Phase 1.5: 53 checks (dev + preview): all Phase 1 loads/errors, multi-file drop, beside-placement, glTF colour→palette, list/viewport/empty-click selection, numeric position/rotation/scale/size, D/C/H/Del/Ctrl+D/Ctrl+A, undo/redo, gizmo drag, W/E/R, settings persistence, Y-up import, tab strip both ways (STL Studio has no COEP and still loads).
- Phase 2: 49 checks (dev + preview): analysis volume/area/watertight, Z cut (sizes, watertight, volume conserved, undo/redo), cylinder cut with 2 pins + gap + lay flat (blind holes, pin size, no overlap), tilted cut keeps painted colours, open-mesh detection, cut error → Repair, repair fills hole (24 cm³), export round trips STL bin/ASCII/cm/Y-up, OBJ+MTL zip (colours), GLB (colours, Y-up), separate-files zip, non-manifold pre-export warning → Repair all.
- Phase 3: 45 checks (dev + preview): resize percent/exact/stretch/unit fix + undo, rotate 90°, mirror (stays watertight/outward), drill through (genus 1, volume), blind countersunk hole, drill miss error, engrave Latin + emboss Arabic (Tajawal) via OpenSCAD, weight/filament estimate, all 14 generators render, live parameter edit (-D define), .scad + PNG downloads, OpenSCAD syntax error shown, AI designer with mocked SSE (passcode, auto-fix after compile error, bbox check, editable result).
- Phase 4: 25 checks (dev + preview): box/cylinder/sphere/cone primitives (sizes, watertight, side-by-side), subtract (genus 1, volume, cutter colour on hole walls), undo, keep-tools, union and intersect volumes, empty-intersection error, hollow box (two shells, volume within 6%), drain hole (one piece), hollow sphere (volume within 8%).
- Phase 5: 25 checks (dev + preview): brush strokes with the mouse (partial coverage, one undo step each, undo/redo keeps viewport colours in sync), painted stroke survives an X cut on both halves, bucket fill stops at 30° edges, 180° stays in its colour region, palette add + edit (a whole picker drag = one undo), split two-colour union into two watertight 8000 mm³ parts, fit-in-box scaling, lay flat by clicking a face, auto orient (largest face down + footprint squared).
- Phase 6: 17 checks (dev + preview): 3MF first in export list, 3MF round trip in cm (2 objects, triangle counts, sizes via unit attribute, per-triangle + per-object colours, watertight), third-party 3MF (cm units, components with transforms, 90° build transform, colorgroup), SVG evenodd hole + circle (size, volume within 2%), stroke-only SVG line, PNG ring silhouette (genus 1, scale), PNG relief plate (watertight, base + depth), PNG next to .gltf treated as texture.
- Phase 7: 14 checks (dev + preview): Wasm not requested before the first CAD file, STEP box size/colour/watertight/on grid, cylinder at draft and fine quality (watertight, size, fine ≫ draft triangles), quality option in Settings, two-solid STEP → two objects with relative placement kept, merged mode, broken STEP → clear error and the worker keeps working. Fixtures are generated STEP AP214 files (tests/e2e/stepFixture.mjs).
- Phase 8: 24 checks (dev + preview) on a 1,001,112-triangle mesh: load 2.2 s, click-select 75 ms, numeric move 66 ms, analysis 4.9 s, Manifold cut 5.8 s, brush stroke 0.2 s, undo store work 20 ms per step, STL export 1.2 s, UI stall < 20 ms after load (headless SwiftShader; real GPUs render faster). Unhandled rejections become visible errors, `?` shortcuts panel content, P/X/K/M shortcuts, edges overlay, measure tool (distance + ΔX/ΔY/ΔZ, label). Earlier fixes: Manifold input pre-welded (2× faster cut/analysis), colour uploads limited to the changed range (25× faster strokes), undo history capped by memory.
- Gap batch 1 (phase10.mjs, 28 checks): merge/split parts (cavities stay), keep upper half, simplify 25 % (watertight, volume within 3 %), smooth, extrude down to z = 0, 4 brim ears, fix 3 flipped triangles, merge overlapping boxes (12000 mm³), auto orient (box on largest face, mushroom flipped onto its cap), overhang shading pixels, arrange without overlap ≥ spacing, align left, distribute Y.
- Gap batch 2 (phase11.mjs, 22 checks): plug volumes exact (socket +0.15 mm radius, +0.1 mm depth), hexagonal frustum plug, square dowels, three clicked connectors on the plane, off-face connector error, dovetail volumes equal the ported trapezoid formulas, tongue/groove do not overlap, groove direction 90°. Phase 2 pins test now uses Dowel.
- Gap batch 3 (phase12.mjs, 13 checks): paint codes per triangle ("4", "8", "0C"), Prusa attribute and namespace, slot list in the dialog, round trip, standard 3MF option, Bambu file (production extension, project_settings colours, model_settings extruder, subdivided triangle), Prusa file (Slic3r_PE.config colours).
- Gap batch 4 (phase13.mjs, 13 checks): Ø8 hole rim found as a circle, faces, merged 30 mm edge, corner snap, face distance/angle, edge angle, centre distances, Shift picks the face, UI picks.
- Gap batch 5 (phase14.mjs, 8 checks): text embossed on a cylinder stays within r 20…21 (curved), undo, engraving on a sphere keeps depth, SVG square +100 mm³.
- Gap batch 6 (phase15.mjs, 16 checks): PLY colours, AMF materials, height-range painting, thickness (solid 30 mm vs hollow 1 mm), 4 slabs of 4000 mm³, drawn-line cut, licence note.
- Measure upgrade (phase16.mjs, 25 checks): hover previews face area, 30 mm edge, edge midpoint, corner, hole Ø 8 / R 4 and the empty hole centre; corner ↔ hole 22.36 / 18.36 mm; edge angle 90° with arc; parallel edges 20 mm; Alt = face, Shift = free point; points mode snaps to corner and hole centre; snapping off; selection unchanged.
- Second review (phase18.mjs, 27 checks): 91 generators, search/category/favourites (persisted), VRML cube, exploded view leaves positions alone, place-on-face onto a box top, hole wall Ø 16 / 20 mm long, snap plug + socket, rebuild an open overlapping mesh into one 14 000 mm³ solid, negative part cut on export and with Apply, linked copies paint together and unlink, refine keeps volume, STEP box = 6 faces, plate with a hole read by OpenCascade and re-imported with genus 1, laser SVG in mm and DXF polylines. All 91 generators render watertight (phase3).
- Feedback batch (phase17.mjs, 31 checks): linear 4 × with 5 mm gaps, 3 × 2 grid pitches, 8 copies on a 30 mm circle 45° apart, merged pattern, object-snap maths + a real gizmo drag snapping two boxes together, snap settings persist, corner snap off → edge, smaller radius → face, face ↔ face 10 mm / 90°, STEP read by OpenCascade and re-imported watertight, OpenSCAD polyhedron, PLY and AMF round trips.
- Image import (phase9.mjs, 20 checks, dev + preview): picking a PNG opens the dialog and adds nothing yet, Levels changes the selection count and the highlighted overlay pixels, Invert flips the selection (sum = all pixels), Smooth changes outline points (145 → 48), Cancel adds nothing, Import adds one watertight ring of ≈35 × 35 × 4 mm on the grid, re-tune reopens with saved settings and Apply replaces in place (undoable), Textures keeps exact red/blue colours without background speckles, a 3000 × 2000 image previews at 400 px and imports at full resolution (≈48 × 32 mm). Phase 6 PNG tests now go through the dialog.
