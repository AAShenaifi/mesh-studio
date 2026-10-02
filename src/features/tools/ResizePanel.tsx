import { useState } from 'react';
import { useSceneStore } from '../../store/useSceneStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { mmToUnit, unitToMm } from '../../settings/units';
import { Button, FieldRow, NumberInput, Segmented, SwitchInput } from '../../ui/primitives';
import { scaleBy, selectionSize } from './transformOps';

type Mode = 'percent' | 'size' | 'fit';

/** STL Studio "Resize / Scale" port: percent, exact size (proportional or stretched) and unit fixes. */
export function ResizePanel() {
  useSceneStore((s) => s.objects); // re-render on changes
  const hasSel = useSceneStore((s) => s.selectedIds.length > 0);
  const unit = useSettingsStore((s) => s.units);
  const [mode, setMode] = useState<Mode>('size');
  const [percent, setPercent] = useState(100);
  const [keep, setKeep] = useState(true);
  const [fit, setFit] = useState<[number, number, number]>([200, 200, 200]);
  const size = selectionSize();
  if (!hasSel) return <p className="m-0 text-[12.5px] text-muted">Select an object to scale it by percent, to an exact size, or to fix its units.</p>;
  const setAxisSize = (axis: number, target: number) => {
    if (!size) return;
    const k = target / (size[axis] || 1);
    scaleBy('Scale to size', keep ? [k, k, k] : (axis === 0 ? [k, 1, 1] : axis === 1 ? [1, k, 1] : [1, 1, k]));
  };
  return (
    <div className="flex flex-col gap-1">
      <FieldRow label="Mode">
        <Segmented<Mode> label="Resize mode" value={mode} onChange={setMode} options={[{ value: 'size', label: 'Exact size' }, { value: 'fit', label: 'Fit box' }, { value: 'percent', label: 'Percent' }]} />
      </FieldRow>
      {mode === 'fit' ? (
        size ? (
          <>
            {(['X', 'Y', 'Z'] as const).map((a, i) => (
              <FieldRow key={a} label={`Max ${a}`} htmlFor={`fit-${a.toLowerCase()}`}>
                <NumberInput id={`fit-${a.toLowerCase()}`} value={mmToUnit(fit[i]!, unit)} min={mmToUnit(0.01, unit)} max={mmToUnit(1e6, unit)} suffix={unit} onCommit={(v) => setFit(fit.map((f, j) => (j === i ? unitToMm(v, unit) : f)) as [number, number, number])} />
              </FieldRow>
            ))}
            <Button className="w-full" onClick={() => { const k = Math.min(...fit.map((f, i) => f / (size[i] || 1))); scaleBy('Scale to fit', [k, k, k]); }}>Scale to fit (keep proportions)</Button>
          </>
        ) : (
          <p className="m-0 text-[12.5px] text-muted">Fit works on one object at a time.</p>
        )
      ) : mode === 'percent' ? (
        <>
          <FieldRow label="Scale" htmlFor="rs-pct">
            <NumberInput id="rs-pct" value={percent} min={0.1} max={100000} suffix="%" onCommit={setPercent} />
          </FieldRow>
          <Button className="w-full" onClick={() => scaleBy(`Scale ${percent}%`, [percent / 100, percent / 100, percent / 100])}>Apply {percent}%</Button>
        </>
      ) : size ? (
        <>
          {(['X', 'Y', 'Z'] as const).map((a, i) => (
            <FieldRow key={a} label={`${a} size`} htmlFor={`rs-${a.toLowerCase()}`}>
              <NumberInput id={`rs-${a.toLowerCase()}`} value={mmToUnit(size[i]!, unit)} min={mmToUnit(0.01, unit)} max={mmToUnit(1e6, unit)} suffix={unit} onCommit={(v) => setAxisSize(i, unitToMm(v, unit))} />
            </FieldRow>
          ))}
          <FieldRow label="Keep proportions" htmlFor="rs-keep" hint={keep ? 'Other axes follow' : 'Stretch one axis only'}>
            <SwitchInput id="rs-keep" checked={keep} onChange={setKeep} />
          </FieldRow>
        </>
      ) : (
        <p className="m-0 text-[12.5px] text-muted">Exact size works on one object at a time.</p>
      )}
      <p className="m-0 mt-2 text-xs font-bold uppercase tracking-[0.6px] text-muted">Unit fix</p>
      <div className="grid grid-cols-2 gap-1.5">
        <Button onClick={() => scaleBy('Inches → mm', [25.4, 25.4, 25.4])}>in → mm (×25.4)</Button>
        <Button onClick={() => scaleBy('cm → mm', [10, 10, 10])}>cm → mm (×10)</Button>
        <Button onClick={() => scaleBy('m → mm', [1000, 1000, 1000])}>m → mm (×1000)</Button>
        <Button onClick={() => scaleBy('mm → inches', [1 / 25.4, 1 / 25.4, 1 / 25.4])}>mm → in (÷25.4)</Button>
      </div>
    </div>
  );
}
