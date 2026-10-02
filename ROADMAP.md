# Mesh Studio roadmap

Built in phases, each with a headless browser test suite in `tests/e2e/`
(`node tests/e2e/run-all.mjs <url>`):

1. Viewer: open STL, OBJ, GLB, 3MF, PLY, AMF with colours
2. Multi-object scene, selection, gizmo, numeric transforms, undo and redo
3. Port of the STL Studio tools, OpenSCAD generators, stats, export
4. Cut (plane or drawn line, connectors, dovetail), booleans, hollow, repair
5. Analysis: volume, thickness, floating parts, weight and filament
6. Painting (brush, bucket, by height) with painted 3MF export
7. STEP import, image to relief, SVG to solid
8. Polish: shortcuts, errors, large-mesh performance, docs
9. Later: text with live preview and 60 fonts, SVG and picture shapes that wrap
   curved surfaces, scale to a measured value

Known limits: the in-app AI designer is disabled (it needs a server function);
very large STEP files can be slow; lesser-tested areas are connectors and
dovetail, paint by height, and all 91 generators on unusual meshes.
