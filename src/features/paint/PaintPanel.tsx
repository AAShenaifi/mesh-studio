import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useSceneStore } from '../../store/useSceneStore';
import { MAX_PALETTE } from '../../scene/palette';
import { Button, FieldRow, NumberInput, Segmented, SwitchInput } from '../../ui/primitives';
import { usePaintStore, type PaintToolKind } from './paintStore';
import { addColor, changeColor, paintHeightRange, paintWhole, refineForPainting, splitByColor } from './ops';

export function PaintPanel() {
  const active = useAppStore((s) => s.activeTool === 'paint');
  const setActiveTool = useAppStore((s) => s.setActiveTool);
  const palette = useSceneStore((s) => s.palette);
  const hasObjects = useSceneStore((s) => s.objects.length > 0);
  const hasSel = useSceneStore((s) => s.selectedIds.length > 0);
  const busy = useAppStore((s) => s.busy);
  const p = usePaintStore();
  const [close, setClose] = useState(true);
  const [band, setBand] = useState<[number, number]>([0, 5]);
  const [edge, setEdge] = useState(1);
  return (
    <div className="flex flex-col gap-2" data-testid="paint-panel">
      <div>
        <p className="m-0 mb-1 text-xs font-semibold text-muted">Colours (slot 1 is the default colour)</p>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Paint colour">
          {palette.map((c, i) => (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={p.color === i}
              aria-label={`Colour ${i + 1} ${c}`}
              onClick={() => p.set({ color: i })}
              className={`h-7 w-7 rounded-md border ${p.color === i ? 'border-ink ring-2 ring-accent-hi' : 'border-line-strong'}`}
              style={{ background: c }}
            />
          ))}
          {palette.length < MAX_PALETTE && (
            <label className="grid h-7 w-7 cursor-pointer place-items-center rounded-md border border-dashed border-line-strong text-muted hover:text-ink" title="Add a colour">
              +
              <input type="color" aria-label="Add colour" className="sr-only" onChange={(e) => p.set({ color: addColor(e.target.value) })} />
            </label>
          )}
        </div>
        <FieldRow label="Edit selected colour" htmlFor="pt-edit">
          <input id="pt-edit" type="color" value={palette[p.color] ?? '#ffffff'} onChange={(e) => changeColor(p.color, e.target.value)} className="h-7 w-10 cursor-pointer" />
        </FieldRow>
      </div>
      <FieldRow label="Tool">
        <Segmented<PaintToolKind> label="Paint tool" value={p.tool} onChange={(t) => p.set({ tool: t })} options={[{ value: 'brush', label: 'Brush' }, { value: 'bucket', label: 'Bucket fill' }]} />
      </FieldRow>
      {p.tool === 'brush' ? (
        <FieldRow label="Brush radius" htmlFor="pt-radius">
          <NumberInput id="pt-radius" value={p.radius} min={0.05} max={500} suffix="mm" onCommit={(v) => p.set({ radius: v })} />
        </FieldRow>
      ) : (
        <FieldRow label="Stop at edges sharper than" htmlFor="pt-angle" hint="180° fills the whole same-coloured region">
          <NumberInput id="pt-angle" value={p.angle} min={0} max={180} suffix="°" onCommit={(v) => p.set({ angle: v })} />
        </FieldRow>
      )}
      <Button variant={active ? 'default' : 'primary'} className="w-full" disabled={!hasObjects} onClick={() => setActiveTool(active ? null : 'paint')}>
        {active ? 'Stop painting (Esc)' : 'Start painting'}
      </Button>
      {active && <p className="m-0 text-xs text-muted">Left-drag paints. Right-drag orbits, wheel zooms. Each stroke is one undo step.</p>}
      <div className="mt-1 grid grid-cols-2 gap-1.5">
        <Button disabled={!hasSel} onClick={() => paintWhole(p.color)}>Paint selection</Button>
        <Button disabled={!hasSel} onClick={() => paintWhole(0)}>Reset colours</Button>
      </div>
      <p className="m-0 mt-1 text-xs font-bold uppercase tracking-[0.6px] text-muted">Fine paint borders</p>
      <FieldRow label="Max triangle edge" htmlFor="pt-refine" hint="Splits big triangles so brush and bucket borders follow your strokes closely">
        <NumberInput id="pt-refine" value={edge} min={0.1} max={50} suffix="mm" onCommit={setEdge} />
      </FieldRow>
      <Button disabled={!hasSel || !!busy} onClick={() => void refineForPainting(edge)}>Refine selected for painting</Button>
      <p className="m-0 mt-1 text-xs font-bold uppercase tracking-[0.6px] text-muted">Height range</p>
      <FieldRow label="From / to Z" htmlFor="pt-z0" hint="Paints triangles whose centre is in this band">
        <NumberInput id="pt-z0" value={band[0]} min={-1e4} max={1e4} suffix="mm" onCommit={(v) => setBand([v, band[1]])} compact />
        <NumberInput id="pt-z1" value={band[1]} min={-1e4} max={1e4} suffix="mm" onCommit={(v) => setBand([band[0], v])} compact />
      </FieldRow>
      <Button
        disabled={!hasObjects}
        onClick={() => {
          const n = paintHeightRange(p.color, band[0], band[1]);
          useAppStore.getState().setReady(n ? `Painted ${n.toLocaleString()} triangles between Z ${band[0]} and ${band[1]} mm` : 'No triangles in that height range');
        }}
      >
        Paint height range
      </Button>
      <p className="m-0 mt-1 text-xs font-bold uppercase tracking-[0.6px] text-muted">Split by colour</p>
      <FieldRow label="Close the cut edges" htmlFor="pt-close" hint="Each part becomes watertight">
        <SwitchInput id="pt-close" checked={close} onChange={setClose} />
      </FieldRow>
      <Button disabled={!hasSel || !!busy} onClick={() => void splitByColor(close)}>Split selected object by colour</Button>
    </div>
  );
}
