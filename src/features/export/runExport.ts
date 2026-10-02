import JSZip from 'jszip';
import { useSceneStore } from '../../store/useSceneStore';
import type { SceneObject } from '../../scene/types';
import type { Unit } from '../../settings/units';
import { exportFormats, type OutFile } from './formats';
import { mergeParts, prepareParts, safeName, saveBlob } from './writers';
import { subtractNegatives } from '../meshTools/negatives';

export type ExportScope = 'selected' | 'visible' | 'all';

export interface ExportRequest {
  format: string;
  scope: ExportScope;
  merge: boolean;
  units: Unit;
  upAxis: 'z' | 'y';
  fileName: string;
}

export function objectsInScope(scope: ExportScope): SceneObject[] {
  const s = useSceneStore.getState();
  if (scope === 'selected') return s.objects.filter((o) => s.selectedIds.includes(o.id));
  if (scope === 'visible') return s.objects.filter((o) => o.visible);
  return s.objects;
}

/** Builds the file(s) for a request. More than one file is zipped. */
export async function buildExport(req: ExportRequest): Promise<{ name: string; blob: Blob; files: number }> {
  const fmt = exportFormats.find((f) => f.id === req.format);
  if (!fmt) throw new Error(`Unknown format ${req.format}`);
  const scoped = objectsInScope(req.scope);
  // negative parts are not printed: they are cut out of the objects they overlap
  const negatives = useSceneStore.getState().objects.filter((o) => o.visible && o.role === 'negative');
  const objects = scoped.filter((o) => o.role !== 'negative');
  if (!objects.length) throw new Error('Nothing to export in this scope.');
  const palette = useSceneStore.getState().palette;
  const cut = negatives.length ? await subtractNegatives(objects, negatives) : new Map();
  const parts = prepareParts(objects, { units: req.units, upAxis: fmt.forceUp ?? req.upAxis }, cut);
  const base = safeName(req.fileName);
  const files: OutFile[] = [];
  if (req.merge || parts.length === 1) {
    // Formats with real multi-object support (OBJ, GLB, 3MF) keep objects apart inside one file.
    const keepsObjects = fmt.id !== 'stl' && fmt.id !== 'stl-ascii' && fmt.id !== 'svg-slice';
    files.push(...(await fmt.build(keepsObjects ? parts : [mergeParts(parts, base)], base, palette, { units: req.units })));
  } else {
    const used = new Map<string, number>();
    for (const p of parts) {
      let n = safeName(p.name);
      const k = used.get(n) ?? 0;
      used.set(n, k + 1);
      if (k) n = `${n}_${k + 1}`;
      files.push(...(await fmt.build([p], n, palette, { units: req.units })));
    }
  }
  if (files.length === 1) {
    const f = files[0]!;
    return { name: f.name, blob: f.data instanceof Blob ? f.data : new Blob([f.data]), files: 1 };
  }
  const zip = new JSZip();
  for (const f of files) zip.file(f.name, f.data);
  return { name: `${base}.zip`, blob: await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }), files: files.length };
}

export async function runExport(req: ExportRequest) {
  const out = await buildExport(req);
  saveBlob(out.name, out.blob);
  return out;
}
