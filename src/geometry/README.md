# geometry/

Reserved for the geometry kernels. Nothing here is loaded in Phase 1.

- `manifold/` — manifold-3d (Wasm): watertight booleans, plane cuts, decompose,
  volume/area, mesh validation. Runs in a Web Worker; uses SharedArrayBuffer
  threads when `crossOriginIsolated` is true (COOP/COEP headers are already set).
- `occt/` — opencascade.js (Wasm): STEP/IGES import → tessellated meshes.
- Shared conversion helpers between `three` BufferGeometry and kernel meshes
  (`MeshGL` for Manifold) live at this level.

Rules: kernels never touch React or the stores directly; they take and return
plain typed arrays so they can run off the main thread. All `.wasm` files are
bundled locally (COEP `require-corp` blocks CDN fetches).
