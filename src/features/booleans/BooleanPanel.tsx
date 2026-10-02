import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { selectedObjects, useSceneStore } from '../../store/useSceneStore';
import { Button, FieldRow, NumberInput, SwitchInput } from '../../ui/primitives';
import { runBoolean, runHollow } from './ops';

export function BooleanPanel() {
  const sel = useSceneStore(useShallow((s) => selectedObjects(s)));
  const busy = useAppStore((s) => s.busy);
  const [keepTools, setKeepTools] = useState(false);
  if (sel.length < 2)
    return <p className="m-0 text-[12.5px] text-muted">Select two or more objects (Shift-click). The first one you select is the target for Subtract; the others are the tools.</p>;
  return (
    <div className="flex flex-col gap-1.5" data-testid="boolean-panel">
      <ol className="m-0 flex list-none flex-col gap-0.5 p-0 text-[12.5px]">
        {sel.map((o, i) => (
          <li key={o.id} className="flex justify-between gap-2">
            <span className="truncate">{o.name}</span>
            <span className="text-faint">{i === 0 ? 'target' : 'tool'}</span>
          </li>
        ))}
      </ol>
      <div className="grid grid-cols-3 gap-1.5">
        <Button disabled={!!busy} onClick={() => void runBoolean('union', false)}>Union</Button>
        <Button disabled={!!busy} onClick={() => void runBoolean('subtract', keepTools)}>Subtract</Button>
        <Button disabled={!!busy} onClick={() => void runBoolean('intersect', false)}>Intersect</Button>
      </div>
      <FieldRow label="Keep tool objects" htmlFor="bool-keep" hint="Subtract only: leave the cutters in the scene">
        <SwitchInput id="bool-keep" checked={keepTools} onChange={setKeepTools} />
      </FieldRow>
    </div>
  );
}

export function HollowPanel() {
  const target = useSceneStore((s) => (s.selectedIds.length === 1 ? selectedObjects(s)[0] : undefined));
  const busy = useAppStore((s) => s.busy);
  const [t, setT] = useState(2);
  const [res, setRes] = useState(0);
  const [drain, setDrain] = useState(false);
  const [dd, setDd] = useState(4);
  if (!target) return <p className="m-0 text-[12.5px] text-muted">Select one watertight object to hollow it with a constant wall thickness.</p>;
  return (
    <div className="flex flex-col gap-1">
      <FieldRow label="Wall thickness" htmlFor="ho-t"><NumberInput id="ho-t" value={t} min={0.2} max={100} suffix="mm" onCommit={setT} /></FieldRow>
      <FieldRow label="Resolution" htmlFor="ho-res" hint="Inner surface grid; 0 = automatic"><NumberInput id="ho-res" value={res} min={0} max={20} suffix="mm" onCommit={setRes} /></FieldRow>
      <FieldRow label="Drain hole (bottom)" htmlFor="ho-drain"><SwitchInput id="ho-drain" checked={drain} onChange={setDrain} /></FieldRow>
      {drain && <FieldRow label="Hole diameter" htmlFor="ho-dd"><NumberInput id="ho-dd" value={dd} min={0.5} max={100} suffix="mm" onCommit={setDd} /></FieldRow>}
      <Button variant="primary" className="mt-1 w-full" disabled={!!busy} onClick={() => void runHollow(t, res, drain ? dd : null)}>Hollow</Button>
    </div>
  );
}
