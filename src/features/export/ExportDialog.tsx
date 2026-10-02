import { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useAppStore } from '../../store/useAppStore';
import { useSceneStore } from '../../store/useSceneStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import type { Unit } from '../../settings/units';
import { CloseIcon } from '../../ui/icons';
import { Button, FieldRow, Segmented, SwitchInput } from '../../ui/primitives';
import { analyzeObject } from '../analysis/analysisStore';
import { repairObject } from '../analysis/AnalysisPanel';
import { exportFormats } from './formats';
import { objectsInScope, runExport, type ExportScope } from './runExport';

export function ExportDialog() {
  const open = useAppStore((s) => s.dialog === 'export');
  const setDialog = useAppStore((s) => s.setDialog);
  const settings = useSettingsStore();
  const hasSel = useSceneStore((s) => s.selectedIds.length > 0);
  const objects = useSceneStore((s) => s.objects);
  const [format, setFormat] = useState('stl');
  const [scope, setScope] = useState<ExportScope>('visible');
  const [merge, setMerge] = useState(true);
  const [units, setUnits] = useState<Unit>(settings.units);
  const [upAxis, setUpAxis] = useState<'z' | 'y'>(settings.upAxis);
  const [fileName, setFileName] = useState('model');
  const [issues, setIssues] = useState<string[] | null>(null);
  const [working, setWorking] = useState(false);
  const fmt = exportFormats.find((f) => f.id === format) ?? exportFormats[0]!;

  useEffect(() => {
    if (!open) return;
    setIssues(null);
    setScope(hasSel ? 'selected' : 'visible');
    const sel = useSceneStore.getState().objects.filter((o) => useSceneStore.getState().selectedIds.includes(o.id));
    setFileName((sel.length === 1 ? sel[0]!.name : objects.length === 1 ? objects[0]!.name : 'scene').replace(/[\\/:*?"<>|]+/g, '_'));
  }, [open]); // eslint-disable-line

  const inScope = useMemo(() => (open ? objectsInScope(scope) : []), [open, scope, objects]);
  const palette = useSceneStore((s) => s.palette);
  const slots = useMemo(() => (fmt.filamentSlots ? [...new Set(inScope.flatMap((o) => [...new Set(o.faceColors)]))].sort((a, b) => a - b) : []), [fmt, inScope]);

  const doExport = async (skipCheck: boolean) => {
    setWorking(true);
    try {
      if (!skipCheck) {
        const results = await Promise.all(inScope.map((o) => analyzeObject(o).then((r) => [o, r] as const)));
        const bad = results.filter(([, r]) => !r.manifold).map(([o, r]) => `${o.name}: ${r.boundaryEdges} open, ${r.nonManifoldEdges} non-manifold edges`);
        if (bad.length) {
          setIssues(bad);
          return;
        }
      }
      const out = await runExport({ format, scope, merge, units, upAxis, fileName });
      useAppStore.getState().setReady(`Exported ${out.name}${out.files > 1 ? ` (${out.files} files)` : ''}`);
      setDialog(null);
    } catch (err) {
      useAppStore.getState().setError(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setWorking(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => setDialog(o ? 'export' : null)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/55" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh-32px)] w-[min(480px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-line-strong bg-surface shadow-2xl outline-none">
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <Dialog.Title className="m-0 text-base font-extrabold">Export</Dialog.Title>
            <Dialog.Close aria-label="Close export" className="rounded-md p-1 text-muted hover:bg-surface-3 hover:text-ink">
              <CloseIcon />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">Choose format, scope, units and file name.</Dialog.Description>
          <div className="overflow-y-auto px-5 py-3">
            <FieldRow label="Format" htmlFor="ex-format">
              <select id="ex-format" value={format} onChange={(e) => setFormat(e.target.value)} className="rounded-[7px] border border-line bg-surface-2 px-2 py-1 text-[13px]">
                {exportFormats.map((f) => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
            </FieldRow>
            <FieldRow label="Objects" hint={`${inScope.length} object${inScope.length === 1 ? '' : 's'}`}>
              <Segmented<ExportScope>
                label="Export scope"
                value={scope}
                onChange={setScope}
                options={[
                  ...(hasSel ? [{ value: 'selected' as const, label: 'Selected' }] : []),
                  { value: 'visible', label: 'Visible' },
                  { value: 'all', label: 'All' },
                ]}
              />
            </FieldRow>
            <FieldRow label="One file" htmlFor="ex-merge" hint={merge ? (fmt.id.startsWith('stl') ? 'Objects merged into one mesh' : 'Objects kept separate inside one file') : 'One file per object (zipped)'}>
              <SwitchInput id="ex-merge" checked={merge} onChange={setMerge} />
            </FieldRow>
            <FieldRow label="Units" hint="Scale written to the file">
              <Segmented<Unit> label="Export units" value={units} onChange={setUnits} options={[{ value: 'mm', label: 'mm' }, { value: 'cm', label: 'cm' }, { value: 'in', label: 'in' }]} />
            </FieldRow>
            <FieldRow label="Up axis" hint={fmt.forceUp ? `${fmt.label} is always ${fmt.forceUp.toUpperCase()}-up` : undefined}>
              <Segmented<'z' | 'y'> label="Export up axis" value={fmt.forceUp ?? upAxis} onChange={(v) => !fmt.forceUp && setUpAxis(v)} options={[{ value: 'z', label: 'Z-up' }, { value: 'y', label: 'Y-up' }]} />
            </FieldRow>
            <FieldRow label="File name" htmlFor="ex-name">
              <input id="ex-name" value={fileName} onChange={(e) => setFileName(e.target.value)} className="w-44 rounded-[7px] border border-line bg-surface-2 px-2 py-1 text-[13px] outline-none focus:border-accent-hi" />
            </FieldRow>
            {slots.length > 0 && (
              <div className="mt-1.5 text-xs text-muted" data-testid="filament-slots">
                <p className="m-0 mb-1">Painted colours open as these filaments (match them to your AMS slots):</p>
                <div className="flex flex-wrap gap-2">
                  {slots.map((c, i) => (
                    <span key={c} className="inline-flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 font-mono">
                      {i + 1}
                      <span className="h-3 w-3 rounded-sm border border-line-strong" style={{ background: palette[c] }} />
                      {palette[c]}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {!fmt.colors && useSceneStore.getState().objects.some((o) => o.faceColors.some((c) => c !== 0)) && (
              <p className="m-0 mt-1 text-xs text-muted">STL has no colours; painted colours are not saved. Use OBJ, GLB or 3MF to keep them.</p>
            )}
            {issues && (
              <div role="alert" className="mt-3 rounded-[9px] border border-warn bg-[rgba(240,182,78,0.12)] p-3 text-[12.5px] text-[#ffe2a8]" data-testid="export-warning">
                <b className="block">Not watertight — slicers may fail or print gaps:</b>
                <ul className="my-1 pl-4">
                  {issues.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
                <div className="mt-2 flex gap-2">
                  <Button
                    disabled={working}
                    onClick={async () => {
                      setWorking(true);
                      for (const o of objectsInScope(scope)) {
                        const r = await analyzeObject(o);
                        if (!r.manifold) await repairObject(o);
                      }
                      setWorking(false);
                      setIssues(null);
                    }}
                  >
                    Repair all
                  </Button>
                  <Button variant="ghost" disabled={working} onClick={() => void doExport(true)}>
                    Export anyway
                  </Button>
                </div>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
            <Dialog.Close asChild>
              <Button variant="ghost">Cancel</Button>
            </Dialog.Close>
            <Button variant="primary" disabled={working || !inScope.length || !fileName.trim()} onClick={() => void doExport(false)}>
              {working ? 'Working…' : `Export ${fmt.ext.toUpperCase()}`}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
