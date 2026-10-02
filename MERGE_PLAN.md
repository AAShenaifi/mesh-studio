# Mesh Studio ← STL Studio merge plan

> **Update (Oct 2026):** the merge is complete. STL Studio was retired and
> Mesh Studio moved to its own site, https://mesh.aashenaifi.com (see DEPLOY.md).
> Old URLs redirect. The AI designer is temporarily disabled. Sections below
> describe the original plan and are kept for history.


Status: **Parity reached (Phase 8).** Every STL Studio feature below exists in
Mesh Studio (see the "Done in" column). STL Studio is unchanged except for its
top tab strip linking to Mesh Studio, and stays live; retiring it is a separate,
reviewed step (section 6).

---

## 1. How this repo is built and deployed (findings)

| Item | Finding |
| --- | --- |
| Host | **Cloudflare Pages** (README, README-SYNC.md, `functions/api/*` are Pages Functions). Not Netlify. Cloudflare Pages reads the same `_headers` / `_redirects` syntax as Netlify, so the requested "Netlify `_headers`" works as-is. |
| Build step | **None.** The repo root is the deploy root. Every tool is a folder of static files (`/<tool>/index.html`). No root `package.json`. |
| Hub | `index.html` + `config.js` (`TOOLS` array) render cards; `sw.js` is a stale-while-revalidate service worker with scope `/` (it will also control `/mesh-studio/` once a user has opened the hub). |
| Headers | Root `_headers` already has one path-scoped rule (`/stl-studio/*` → `Cache-Control: no-cache`). |
| Server code | `functions/api/*.js` (sync, Gemini, STL AI via Claude, lookups). |
| Visual style | Dark, purple accent. Hub: `#101010` bg, `#80519F` primary, `#E1CCE8` light, Cairo font. STL Studio refines that into a token set (`--bg #0e0a13`, `--surface #16101d`, `--border #30253d`, `--accent #80519f`, `--accent-soft #e1cce8`, ok/warn/err colours, 10 px radius, uppercase 12 px section headings, mono numbers). Mesh Studio reuses STL Studio's tokens 1:1 as Tailwind theme colours. |

## 2. Where Mesh Studio lives and how it ships

- **Source:** `apps/mesh-studio/` (Vite + React + TS project with its own `package.json` and lockfile). Nothing at the repo root depends on it.
- **Public URL:** `https://apps.aashenaifi.com/mesh-studio/` → Vite `base: '/mesh-studio/'` (used in dev too, so path bugs show up locally).
- **Headers:** root `_headers` gets a rule scoped to `/mesh-studio` and `/mesh-studio/*` only:
  `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`,
  `Cross-Origin-Resource-Policy: same-site`. Other tools (hub, STL Studio, Workshop Index, …) are not matched, so they keep loading Google Fonts and CDN assets exactly as today. The dev server (`vite`) and `vite preview` send the same COOP/COEP headers.
- **Build output:** `npm run build` → `apps/mesh-studio/dist/` (git-ignored, for local checks and `npm run preview`). `npm run build:site` → writes the production build to `/mesh-studio/` at the repo root, i.e. exactly where Cloudflare Pages serves it.

**Deployment choice still open (decide before the first real deploy, not needed for Phase 1):**

1. **Commit the build** (least disruptive, zero dashboard changes): run `npm run build:site` and commit `/mesh-studio/`. Text JS/CSS only (~1 MB), no binaries. Downside: built files in git history.
2. **Let Cloudflare build it:** Pages project → Settings → Build: build command `npm ci --prefix apps/mesh-studio && npm run build:site --prefix apps/mesh-studio`, output directory unchanged (`/`). Cleaner history; downside: a failed app build blocks deploys of every tool.

Recommendation: option 1 until the app stabilises, then switch to option 2.
When it goes live, add a hub card in `config.js` (`{ id: "mesh-studio", name: "Mesh Studio", path: "/mesh-studio/" }`).

**Embedding from aashenaifi.com later:** an `<iframe>` of `/mesh-studio/` works, but `SharedArrayBuffer` (multi-threaded Wasm) is only available inside the frame if the parent page is also cross-origin isolated and the iframe has `allow="cross-origin-isolated"`. Linking (new tab) keeps full performance; the embed should fall back to single-threaded Wasm. `CORP: same-site` already allows an isolated aashenaifi.com parent to frame it.

## 3. STL Studio feature inventory

### Loading / input
- L1. STL open via drop zone or file picker (binary + ASCII, own parser).
- L2. "Use result as new input" (chain tool results).
- L3. Attach STL / image to the AI chat.

### Viewing
- V1. Three.js viewer, Z-up, orbit controls with damping.
- V2. mm grid auto-sized to the model (10 mm minor, 50 mm major) + axes helper.
- V3. Hemisphere + two directional lights, lilac standard material.
- V4. View presets: 3D/iso, Front, Right, Top (code also has Back, Left); fit to model.
- V5. Bounding-box helper with X/Y/Z dimension labels projected in 3D (toggle).
- V6. Edges overlay (feature edges at 25°, toggle).
- V7. Point-to-point measure tool (raycast, distance + ΔX/ΔY/ΔZ readout).
- V8. Empty state, status pill (busy/ok/error dot), warning bar, toast.

### Analysis / stats strip
- S1. Size X × Y × Z.
- S2. Volume (cm³) and surface area.
- S3. Weight + filament-length estimate (material density PLA/PETG/ABS/ASA/TPU, infill %).
- S4. Triangle count + watertight check (edge manifoldness).
- S5. Connected pieces + "floating piece" detection.

### STL tools (OpenSCAD templates applied to the loaded mesh)
- T1. Resize / Scale: percent, fit to exact X/Y/Z, stretch to exact XYZ, unit fix (in/cm/m → mm).
- T2. Rotate / Mirror (any angle, mirror axis) then re-centre and drop to Z = 0.
- T3. Cut in Two at a height, with optional alignment-pin holes, halves laid side by side.
- T4. Drill Hole (Z/X/Y axis, diameter, countersink).
- T5. Add Text: engrave/emboss, fonts incl. Arabic (Cairo, Tajawal, Noto Naskh) with RTL shaping.

### Generators (OpenSCAD Customizer-driven)
- G1. 14 parametric generators: Dual-Letter Illusion, Name Sign, Keychain, Stamp, Stencil, Cookie Cutter, Project Box + Lid, Board Tray, Gridfinity Bin, Spur/Helical Gear, GT2 Pulley, Metric Bolt & Nut, Compression Spring, Control Knob.
- G2. Customizer comment parser → auto UI (sliders, selects, checkboxes, text + symbol picker), values persisted per generator.
- G3. Editable OpenSCAD code, reset, computed `INFO` lines, render log.

### AI Designer
- A1. Chat with Claude through `/api/stl-ai` (passcode, model + effort settings, streaming with thinking).
- A2. Image + STL attachments, render snapshot sent with change requests.
- A3. Auto-fix loop: compile errors (2 retries) and planned-vs-measured bounding-box check.
- A4. Token/cost pills, persisted conversation, example prompts, parameter tweaking of AI output.

### Export
- E1. Download binary STL. E2. Download `.scad` (with used parameter values). E3. Save PNG snapshot.

### Engine / platform
- P1. OpenSCAD 2025 WASM (Manifold backend) in a module worker, serialized renders, timeout + respawn.
- P2. BOSL2 + font pack (`libs.bin`, 2.3 MB) and on-demand fonts fetched from raw.githubusercontent.com.
- P3. Responsive layout (viewer sticks on top below 900 px), Cairo font, back-to-hub link, `no-cache` header.

## 4. Coverage (final)

| ID | STL Studio feature | Mesh Studio | Done in |
| --- | --- | --- | --- |
| L1 | Open STL | STL/OBJ/GLB/glTF/3MF/STEP/IGES/SVG/PNG/ZIP, drop anywhere | 1, 6, 7 |
| L2 | Use result as new input | Every tool edits the object in place; undo/redo | 1.5 |
| L3 | Attach STL/image to AI | AI designer edits the selected generator object's code | 3 |
| V1 | Orbit viewer, Z-up | Z-up workspace, orbit, gizmo, view presets | 1, 1.5 |
| V2 | Auto-sized grid | Replaced by configurable grid | 1 |
| V3 | Lights, material | Plain studio lights, palette colours | 1 |
| V4 | View presets / fit | Fit / iso / front / right / top (+ keys) | 1, 1.5 |
| V5 | Dimension labels | Dimensions in the sidebar + selection box | 1.5 |
| V6 | Edges overlay | Edges toggle (K), feature edges > 25° | 8 |
| V7 | Measure tool | Measure (M): distance + ΔX/ΔY/ΔZ, label in the viewport | 8 |
| V8 | Status / warnings | Status bar, error banner, notice bar | 1, 2 |
| S1–S5 | Size, volume, weight, filament, watertight, pieces, floating | Analysis panel + weight estimate | 2, 3 |
| T1 | Resize / unit fix | Resize panel (percent, exact, stretch, fit, unit fixes) | 3, 5 |
| T2 | Rotate / mirror | Rotate 90° / mirror panel, gizmo, numeric | 1.5, 3 |
| T3 | Cut in two + pins | Plane cut with gizmo, tilt, gap, lay flat, pin holes + dowels | 2 |
| T4 | Drill hole | Native Manifold drill (through/blind, countersink) | 3 |
| T5 | Add text (incl. Arabic) | OpenSCAD engrave/emboss, Tajawal / Noto Naskh | 3 |
| G1–G3 | 14 generators, Customizer UI, code, INFO | All 14, live parameters, code editing, info lines | 3 |
| A1–A4 | AI designer | Same `/api/stl-ai`, streaming, auto-fix, size check | 3 |
| E1–E3 | STL / .scad / PNG export | Export dialog (3MF, STL, OBJ, GLB) + .scad + PNG | 2, 3, 6 |
| P1 | OpenSCAD engine | Own worker, reuses `/stl-studio/assets/` | 3 |
| P2 | Fonts from GitHub | Not fetched (COEP + local-only); Cairo/emoji fall back | 3 |
| P3 | Responsive layout | Desktop layout; narrow screens not optimised | — |

### Dropped on purpose
- Bed-centric wording/logic ("drop onto the bed", "floating above the bed"): Mesh Studio is a free workspace; models are placed on the grid plane only as a convenience on load.
- Auto-resizing grid (replaced by user settings).
- Hand-rolled DOM helpers (`el()`, manual tab panes) — replaced by React components.
- Hand-written STL parser (Three.js loaders); STL **writer** may be reused conceptually but will be rewritten in TS.

## 5. Phase roadmap (historical; see ROADMAP.md for the live status)

1. **Shell** (done): workspace, settings, loaders, dimensions.
2. **Manifold core + Cut** (first port: T3), mesh analysis (S2, S4, S5), STL export (E1), undo/redo.
3. **Transform & inspect**: T1, T2, V4 extras, V5 labels, V6, V7, E3, responsive sidebar.
4. **Booleans & prep**: T4, S3, multi-object scene, 3MF export.
5. **Paint & shapes**: multi-colour painting, SVG/PNG extrusion, T5 text.
6. **Generators + AI**: G1–G3, A1–A4, E2 via the OpenSCAD engine.
7. **CAD import**: STEP via opencascade.js.
8. **Parity check → retire STL Studio**: add `_redirects` `/stl-studio/* /mesh-studio/ 302`, remove the hub card, delete `/stl-studio/` in a separate, reviewed PR.

## 6. Retiring STL Studio (when you decide)

1. Use Mesh Studio for a while and confirm nothing from STL Studio is missed.
2. Keep `stl-studio/assets/` (OpenSCAD Wasm + fonts) or move it to e.g.
   `/shared/openscad/` and update `ASSETS` in `src/features/scad/scad.worker.ts`.
3. Add `/stl-studio/* /mesh-studio/ 302` to a root `_redirects`, remove the
   STL Studio hub card and the tab strip, then delete the old files, in one
   reviewed pull request.
