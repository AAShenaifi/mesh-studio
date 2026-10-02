// Phase 2+: Manifold and OpenCascade adapters are exported from here.
// Shapes shared with the kernels: flat typed arrays, no three.js objects, so
// the data can be transferred to and from Web Workers without copying.

export interface MeshBuffers {
  /** xyz per vertex, in millimetres. */
  positions: Float32Array;
  /** Three vertex indices per triangle. */
  indices: Uint32Array;
}
