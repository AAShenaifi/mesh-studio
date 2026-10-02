export interface KernelMesh {
  /** World-space soup, 9 floats per triangle. */
  positions: Float32Array;
  /** Palette index per triangle. */
  faceColors: Uint16Array;
}

export interface KernelRequest {
  id: number;
  op: string;
  args: unknown;
}

export interface KernelResponse {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
  known?: boolean;
}
