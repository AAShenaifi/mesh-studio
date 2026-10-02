import { create } from 'zustand';
import type { Analysis } from '../../geometry/meshOps';
import { kernel, kernelMesh } from '../../geometry/kernel';
import type { SceneObject } from '../../scene/types';

export type AnalysisResult = Analysis & { manifold: boolean; genus: number | null; status: string };

/** Results cached per geometry + transform (records are immutable, so the record itself is the key). */
const cache = new WeakMap<SceneObject, Promise<AnalysisResult>>();

export function analyzeObject(o: SceneObject): Promise<AnalysisResult> {
  let p = cache.get(o);
  if (!p) {
    p = kernel<AnalysisResult>('analyze', { mesh: kernelMesh(o) });
    p.catch(() => cache.delete(o));
    cache.set(o, p);
  }
  return p;
}

interface AnalysisState {
  results: Map<string, { record: SceneObject; result: AnalysisResult }>;
  setResult: (o: SceneObject, r: AnalysisResult) => void;
}

export const useAnalysisStore = create<AnalysisState>()((set, get) => ({
  results: new Map(),
  setResult: (o, r) => {
    const results = new Map(get().results);
    results.set(o.id, { record: o, result: r });
    set({ results });
  },
}));
