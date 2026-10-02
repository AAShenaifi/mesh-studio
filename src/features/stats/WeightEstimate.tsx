import { useState } from 'react';
import type { AnalysisResult } from '../analysis/analysisStore';

// STL Studio stats port: weight and filament length for FDM printing.
const MATERIALS = [
  ['PLA', 1.24], ['PETG', 1.27], ['ABS', 1.04], ['ASA', 1.07], ['TPU', 1.21], ['Nylon', 1.14],
] as const;
const INFILL = [0.1, 0.15, 0.2, 0.4, 1] as const;

export function estimate(volumeMm3: number, areaMm2: number, density: number, infill: number) {
  const shell = Math.min(volumeMm3, areaMm2 * 0.8); // ~0.8 mm of walls/skins
  const grams = ((shell + (volumeMm3 - shell) * infill) / 1000) * density;
  const metres = grams / density / (Math.PI * 0.0875 * 0.0875) / 100; // 1.75 mm filament
  return { grams, metres };
}

export function WeightEstimate({ result }: { result: AnalysisResult }) {
  const [mat, setMat] = useState(0);
  const [inf, setInf] = useState(1);
  if (!result.manifold && !result.watertight) return null;
  const { grams, metres } = estimate(Math.abs(result.volume), result.area, MATERIALS[mat]![1], INFILL[inf]!);
  return (
    <div className="mt-1.5 rounded-[7px] border border-line p-2 text-[12.5px]" data-testid="weight">
      <div className="mb-1 flex gap-1.5">
        <select aria-label="Material" value={mat} onChange={(e) => setMat(+e.target.value)} className="flex-1 rounded border border-line bg-surface-2 px-1 py-0.5 text-xs">
          {MATERIALS.map((m, i) => <option key={m[0]} value={i}>{m[0]} ({m[1]} g/cm³)</option>)}
        </select>
        <select aria-label="Infill" value={inf} onChange={(e) => setInf(+e.target.value)} className="rounded border border-line bg-surface-2 px-1 py-0.5 text-xs">
          {INFILL.map((v, i) => <option key={v} value={i}>{v * 100}% infill</option>)}
        </select>
      </div>
      <div className="flex justify-between"><span className="text-muted">Weight</span><span className="font-mono" data-testid="an-weight">≈ {grams.toFixed(1)} g</span></div>
      <div className="flex justify-between"><span className="text-muted">Filament (1.75 mm)</span><span className="font-mono">≈ {metres.toFixed(2)} m</span></div>
    </div>
  );
}
