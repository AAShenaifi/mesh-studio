# Mesh Studio

Browser-based 3D mesh editor and model-prep workstation, served at
`https://mesh.aashenaifi.com`. Everything runs locally in the browser; files
never leave the device. (The optional AI designer, the only feature that talks
to a server, is temporarily disabled.)

Stack: React 19, TypeScript, Vite, Tailwind CSS 4, Radix UI, Zustand, Three.js
with @react-three/fiber and drei, manifold-3d (Wasm), occt-import-js
(OpenCascade Wasm), three-mesh-bvh, JSZip. The OpenSCAD Wasm build and font
pack used for generators and text live in `public/openscad/`.

## Features

| Area | What you can do |
| --- | --- |
| Open | STL (binary/ASCII), OBJ (+MTL colours), GLB/glTF (+.bin/textures), 3MF (colours, components, units, Bambu/Prusa painting), PLY, AMF, VRML, STEP/IGES/BREP (OpenCascade, quality preset), SVG and PNG/JPG (extrusion), ZIP of any of these. Drag-and-drop anywhere or Open. |
| Scene | Snapping while moving (to steps, to other objects' sides/centres, onto the grid; all adjustable), linear / grid / circular patterns, feature-edges overlay (K), measure (M) like Bambu Studio / PrusaSlicer: live hover preview, snapping to corners, edge midpoints and hole centres, edge length, hole diameter/radius, face area, distances, angles with arcs, click a value to copy; arrange / align / distribute, many objects, object list (rename, hide), click / Shift-click selection, move/rotate/scale gizmo (W/E/R, snapping), numeric position/rotation/scale/size, drop to grid, center, duplicate, delete, undo/redo for every edit. |
| Edit | Analysis (volume, area, watertight check, open/non-manifold edges, pieces, floating parts, wall thickness, weight + filament estimate), Repair (fills holes), Fix normals, Merge overlaps, plane Cut/split with gizmo, tilt, drawn cut line, gap, keep upper/lower, lay-flat, slabs, connectors (plug/dowel, prism/frustum, circle/square/hexagon/triangle, tolerances, click placement), dovetail, Split into parts / merge, Simplify, Smooth, Extrude down, Brim ears, Booleans (union/subtract/intersect), Hollow (constant wall, drain hole), Resize (percent, exact, stretch, fit box, unit fixes), Rotate 90° / Mirror, Drill (through/blind, countersink), Add text (engrave/emboss incl. Arabic) on the top face or projected onto any curved surface by clicking (text or SVG, own colour). |
| Paint | Palette editing, brush and bucket fill (stops at sharp edges), paint by height range, paint/reset selection, split by colour (optionally closed), lay flat by clicking a face, auto orient for printing (Bambu's algorithm) or largest face down, overhang shading. Colours survive cuts, booleans and repair, and export to 3MF/OBJ/GLB. |
| Create | Box/cylinder/sphere/cone, 91 OpenSCAD generators (search, categories, favourites; boxes, bins, gears, rack & pinion, planetary set, pulleys, sprockets, threads, containers, funnels, SKÅDIS, Gridfinity, fasteners, brackets, electronics, toys, Braille and laser parts) with live parameters and .scad download, blank OpenSCAD model, SVG extrusion, Image import dialog for PNG/JPG (live selection overlay, Levels, Invert, Smooth, Contour or Relief/lithophane, image colours on top, live 3D preview, re-tune later) (the prompt-to-OpenSCAD AI designer is temporarily disabled). |
| Export | 3MF for Bambu Studio / PrusaSlicer (painting → filament slots), standard 3MF (colours, units), STEP (solid for CAD, merged planar faces), OpenSCAD (.scad polyhedron), PLY, AMF, SVG / DXF outlines for laser cutting, STL binary/ASCII, OBJ+MTL, GLB; scope selected/visible/all; one file or one per object (zip); units; up axis; non-watertight warning with Repair all; PNG snapshot. |

Press `?` in the app for all keyboard shortcuts. Deployment: see DEPLOY.md.

## Run locally (Windows, macOS, Linux)

```bash
cd apps/mesh-studio
npm install
npm run dev
```

Open http://localhost:5173/. The dev and preview servers send the same
cross-origin isolation headers as production; the status bar shows
**Isolated ✓**.

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server (http://localhost:5173/) |
| `npm run build` | Type-check, then build to `dist/` (git-ignored) |
| `npm run preview` | Serve `dist/` at http://localhost:4173/ |
| `npm run typecheck` | TypeScript only |

Node 20.19+ (tested with Node 22 on Linux; the owner runs Node 24 on Windows 11).

## Tests

Headless Chromium end-to-end tests live in `tests/e2e/` (one file per phase,
fixtures generated at runtime in the temp folder, nothing binary committed):

```bash
npm run build && npm run preview          # in one terminal
node tests/e2e/run-all.mjs http://localhost:4173/
node tests/e2e/run-all.mjs http://localhost:4173/ phase6   # one suite
```

They use Playwright (`PLAYWRIGHT_MODULE` can point at its `index.mjs`) and save
screenshots to the temp folder (`SHOTS_DIR` to change it).

## Deploying to mesh.aashenaifi.com (Cloudflare Pages)

Mesh Studio is its own Cloudflare Pages project: push to `main` and Cloudflare
runs `npm ci && npm run build` in this folder and publishes `dist/`. The
one-time project settings are in [DEPLOY.md](./DEPLOY.md).

## Layout

```
src/
  main.tsx, App.tsx, features.ts   entry, shell, feature registration
  scene/       object model, palette, geometry helpers (world boxes, transforms)
  store/       useSceneStore (objects, selection, undo), useAppStore (UI), useSettingsStore (persisted)
  loaders/     file pipeline, STL/OBJ/glTF parsers, file picker
  geometry/    Manifold kernel worker (cut, booleans, repair, hollow, primitives, extrusion, analysis)
  viewport/    R3F canvas, camera, grid, lights, object meshes, gizmo
  ui/          toolbar, tabs, sidebar, dialogs, shortcuts, primitives
  features/    analysis, cut, booleans, tools, paint, prep, export, formats (3MF/SVG/PNG),
               step (OpenCascade worker), scad (OpenSCAD worker), generators, ai, stats
tests/e2e/     headless browser tests and fixture generators
```

## Ported code

Some features are translated from Bambu Studio (AGPL-3.0): simplify, auto
orient, cut connectors and dovetail, painted-3MF encoding, feature measure.
They live in `src/ported/` and are listed in [PORTED.md](./PORTED.md); Settings →
About links to the source. [GAP_ANALYSIS.md](./GAP_ANALYSIS.md) has the
feature comparison and what is still missing.

## Licences of bundled engines

manifold-3d (Apache-2.0), occt-import-js / OpenCascade (LGPL-2.1, loaded as a
separate Wasm file), three.js and three-mesh-bvh (MIT), JSZip (MIT/GPL dual,
used under MIT). OpenSCAD (GPL-2) is not bundled; it is loaded at runtime from
STL Studio's assets.

See `ROADMAP.md` for phase history, decisions and known limitations, and
`MERGE_PLAN.md` for the STL Studio feature mapping.
