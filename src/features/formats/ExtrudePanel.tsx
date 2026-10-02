import { useAppStore } from '../../store/useAppStore';
import { useSceneStore } from '../../store/useSceneStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { mmToUnit, unitToMm } from '../../settings/units';
import { Button, FieldRow, NumberInput } from '../../ui/primitives';
import { useExtrudeStore } from './extrudeStore';
import { pickAndExtrude } from './extrude';

export function ExtrudePanel() {
  const s = useExtrudeStore();
  const unit = useSettingsStore((x) => x.units);
  const palette = useSceneStore((x) => x.palette);
  const busy = useAppStore((x) => x.busy);
  return (
    <div className="flex flex-col gap-1" data-testid="extrude-panel">
      <FieldRow label="Width" htmlFor="ex2-w" hint="Height follows the drawing"><NumberInput id="ex2-w" value={mmToUnit(s.width, unit)} min={mmToUnit(0.1, unit)} max={mmToUnit(5000, unit)} suffix={unit} onCommit={(v) => s.set({ width: unitToMm(v, unit) })} /></FieldRow>
      <FieldRow label="Depth" htmlFor="ex2-d"><NumberInput id="ex2-d" value={mmToUnit(s.depth, unit)} min={mmToUnit(0.05, unit)} max={mmToUnit(1000, unit)} suffix={unit} onCommit={(v) => s.set({ depth: unitToMm(v, unit) })} /></FieldRow>
      <FieldRow label="Colour">
        <div className="flex flex-wrap gap-1">
          {palette.slice(0, 8).map((c, i) => (
            <button key={c + i} type="button" aria-label={`Extrude colour ${c}`} aria-pressed={s.color === i} onClick={() => s.set({ color: i })} className={`h-5 w-5 rounded border ${s.color === i ? 'border-ink ring-2 ring-accent-hi' : 'border-line-strong'}`} style={{ background: c }} />
          ))}
        </div>
      </FieldRow>
      <Button variant="primary" disabled={!!busy} onClick={() => pickAndExtrude('.svg,image/svg+xml')}>Extrude SVG…</Button>
      <p className="m-0 text-xs text-muted">Dropping an .svg onto the viewport uses these settings too. Images (PNG/JPG) open the Image import dialog — see “Image import”.</p>
    </div>
  );
}
