/// <reference lib="webworker" />
// STEP / IGES / BREP import with OpenCascade (occt-import-js, LGPL-2.1, local Wasm).
// This worker (and its 7.6 MB Wasm) is only created when the first CAD file is opened.
import occtimportjs from 'occt-import-js';
import wasmUrl from 'occt-import-js/dist/occt-import-js.wasm?url';

interface OcctMesh {
  name?: string;
  color?: [number, number, number];
  brep_faces: Array<{ first: number; last: number; color: [number, number, number] | null }>;
  attributes: { position: { array: number[] } };
  index: { array: number[] };
}
interface OcctResult {
  success: boolean;
  meshes: OcctMesh[];
}
interface Occt {
  ReadStepFile(content: Uint8Array, params: unknown): OcctResult;
  ReadIgesFile(content: Uint8Array, params: unknown): OcctResult;
  ReadBrepFile(content: Uint8Array, params: unknown): OcctResult;
}

let occt: Promise<Occt> | null = null;

export interface StepPart {
  name: string;
  positions: Float32Array;
  /** sRGB hex per triangle, '' when the file has no colour for it. */
  colors: string[];
}

const hex = (c: [number, number, number] | null | undefined) =>
  c ? '#' + c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('') : '';

self.onmessage = async (e: MessageEvent<{ id: number; format: 'step' | 'iges' | 'brep'; data: ArrayBuffer; linear: number; angular: number }>) => {
  const { id, format, data, linear, angular } = e.data;
  try {
    occt ??= (occtimportjs as unknown as (o: object) => Promise<Occt>)({ locateFile: () => wasmUrl });
    const lib = await occt;
    const params = { linearUnit: 'millimeter', linearDeflectionType: 'bounding_box_ratio', linearDeflection: linear, angularDeflection: angular };
    const bytes = new Uint8Array(data);
    const res = format === 'iges' ? lib.ReadIgesFile(bytes, params) : format === 'brep' ? lib.ReadBrepFile(bytes, params) : lib.ReadStepFile(bytes, params);
    if (!res.success) throw new Error('OpenCascade could not read this file. It may be damaged or use an unsupported schema.');
    const parts: StepPart[] = res.meshes.map((m, i) => {
      const p = m.attributes.position.array;
      const idx = m.index.array;
      const tris = idx.length / 3;
      const positions = new Float32Array(tris * 9);
      for (let t = 0; t < tris; t++) for (let k = 0; k < 3; k++) {
        const v = idx[t * 3 + k]!;
        positions[t * 9 + k * 3] = p[v * 3]!;
        positions[t * 9 + k * 3 + 1] = p[v * 3 + 1]!;
        positions[t * 9 + k * 3 + 2] = p[v * 3 + 2]!;
      }
      const colors = new Array<string>(tris).fill(hex(m.color));
      for (const f of m.brep_faces ?? []) if (f.color) for (let t = f.first; t <= f.last && t < tris; t++) colors[t] = hex(f.color);
      return { name: m.name || `Part ${i + 1}`, positions, colors };
    });
    (self as unknown as Worker).postMessage({ id, ok: true, parts }, parts.map((x) => x.positions.buffer as ArrayBuffer));
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
