import { useEffect, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { selectedObjects, useSceneStore } from '../../store/useSceneStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { createObject } from '../../scene/create';
import { kernel, kernelMesh } from '../../geometry/kernel';
import type { KernelMesh } from '../../geometry/protocol';
import { formatLength, mmToUnit, type Unit } from '../../settings/units';
import type { SceneObject } from '../../scene/types';
import { Button } from '../../ui/primitives';
import { analyzeObject, useAnalysisStore, type AnalysisResult } from './analysisStore';
import { analysisExtras } from './extras';
import { fixNormalsSelected, mergeShellsSelected, remeshSelected } from '../meshTools/ops';

const AUTO_LIMIT = 400_000;

function volumeText(mm3: number, unit: Unit) {
  const k = mmToUnit(1, unit) ** 3;
  return unit === 'mm' ? `${(mm3 / 1000).toFixed(2)} cm³` : `${(mm3 * k).toFixed(unit === 'in' ? 3 : 2)} ${unit}³`;
}
function areaText(mm2: number, unit: Unit) {
  const k = mmToUnit(1, unit) ** 2;
  return unit === 'mm' ? `${(mm2 / 100).toFixed(2)} cm²` : `${(mm2 * k).toFixed(unit === 'in' ? 3 : 2)} ${unit}²`;
}

function Row({ k, v, tone }: { k: string; v: string; tone?: 'ok' | 'warn' | 'err' }) {
  const color = tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'err' ? 'text-err' : '';
  return (
    <div className="flex justify-between gap-3 py-0.5 text-[13px]">
      <span className="text-muted">{k}</span>
      <span className={`font-mono text-[12.5px] ${color}`} data-testid={`an-${k.toLowerCase().replace(/[^a-z]+/g, '-')}`}>{v}</span>
    </div>
  );
}

export async function repairObject(o: SceneObject) {
  const scene = useSceneStore.getState();
  const res = await useAppStore.getState().run('Repair', () =>
    kernel<{ mesh: KernelMesh; report: { holesFilled: number; removedTriangles: number; manifold: boolean } }>('repair', {
      mesh: kernelMesh(o),
      paletteSize: scene.palette.length,
    }),
  );
  if (!res) return null;
  const fixed = createObject(o.name, res.mesh.positions, res.mesh.faceColors, { ...o.source }, 'keep');
  scene.replaceObjects(`Repair ${o.name}`, [o.id], [{ ...fixed, id: o.id }]);
  const r = res.report;
  useAppStore.getState().setReady(
    `Repair: filled ${r.holesFilled} hole${r.holesFilled === 1 ? '' : 's'}, removed ${r.removedTriangles} bad triangle${r.removedTriangles === 1 ? '' : 's'}. ${r.manifold ? 'Mesh is now watertight.' : 'Still not watertight (complex damage).'}`,
  );
  if (!r.manifold) useAppStore.getState().setNotice('Repair could not make this mesh fully watertight. Cuts and booleans need a watertight mesh.');
  return res.report;
}

export function AnalysisPanel() {
  const target = useSceneStore((s) => (s.selectedIds.length === 1 ? selectedObjects(s)[0] : undefined));
  const unit = useSettingsStore((s) => s.units);
  const busy = useAppStore((s) => s.busy);
  const cached = useAnalysisStore((s) => (target ? s.results.get(target.id) : undefined));
  const result: AnalysisResult | undefined = cached && cached.record === target ? cached.result : undefined;
  const [running, setRunning] = useState(false);

  const run = async (o: SceneObject) => {
    setRunning(true);
    try {
      useAnalysisStore.getState().setResult(o, await analyzeObject(o));
    } catch (err) {
      useAppStore.getState().setError(`Analysis failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    if (target && !result && target.faceColors.length <= AUTO_LIMIT) void run(target);
  }, [target, result]);

  if (!target) return <p className="m-0 text-[12.5px] text-muted">Select one object to measure volume, area and check that it is watertight.</p>;
  if (!result)
    return running ? (
      <p className="m-0 text-[12.5px] text-muted">Analysing…</p>
    ) : (
      <Button className="w-full" onClick={() => void run(target)}>Analyse ({target.faceColors.length.toLocaleString()} triangles)</Button>
    );

  // inner cavity shells (negative volume) are not floating parts
  const floating = result.componentMinZ.filter((z, i) => z > result.bboxMin[2] + 0.2 && (result.componentVolume?.[i] ?? 1) >= 0);
  return (
    <div data-testid="analysis">
      <Row k="Volume" v={volumeText(Math.abs(result.volume), unit)} />
      <Row k="Surface area" v={areaText(result.area, unit)} />
      <Row k="Triangles" v={result.triangles.toLocaleString()} />
      <Row k="Watertight" v={result.manifold ? 'Yes (manifold)' : result.watertight ? 'Edges closed, not manifold' : 'No'} tone={result.manifold ? 'ok' : 'err'} />
      {result.boundaryEdges > 0 && <Row k="Open edges" v={String(result.boundaryEdges)} tone="err" />}
      {result.nonManifoldEdges > 0 && <Row k="Non-manifold edges" v={String(result.nonManifoldEdges)} tone="err" />}
      {result.degenerate > 0 && <Row k="Degenerate faces" v={String(result.degenerate)} tone="warn" />}
      <Row k="Pieces" v={String(result.components)} tone={floating.length ? 'warn' : undefined} />
      {floating.length > 0 && (
        <p className="m-0 my-1 text-xs text-warn">
          {floating.length} piece{floating.length > 1 ? 's float' : ' floats'} above the object’s lowest point (up to {formatLength(Math.max(...floating) - result.bboxMin[2], unit)}); it would need supports.
        </p>
      )}
      {result.genus !== null && <Row k="Genus (holes through)" v={String(result.genus)} />}
      {analysisExtras.map((E, i) => (
        <E key={i} result={result} object={target} />
      ))}
      {!result.manifold && (
        <Button variant="primary" className="mt-2 w-full" disabled={!!busy} onClick={() => void repairObject(target)}>
          Repair (fill holes, fix faces)
        </Button>
      )}
      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        <Button disabled={!!busy} onClick={() => void fixNormalsSelected()} title="Make every triangle face outwards (cavities inwards)">Fix normals</Button>
        <Button disabled={!!busy || result.components < 2} onClick={() => void mergeShellsSelected()} title="Unite overlapping pieces into one clean solid">Merge overlaps</Button>
      </div>
      <Button className="mt-1.5 w-full" disabled={!!busy} onClick={() => void remeshSelected(0)} title="Rebuilds the surface on a fine grid: fixes self-intersections, overlaps and small gaps; tiny details below the grid size are smoothed">
        Rebuild as solid (fix self-intersections)
      </Button>
    </div>
  );
}
