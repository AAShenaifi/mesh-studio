import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useSceneStore } from '../../store/useSceneStore';
import { FieldRow, NumberInput, Segmented, Button } from '../../ui/primitives';
import { addPrimitive } from './ops';

type Kind = 'box' | 'cylinder' | 'sphere' | 'cone';

export function PrimitivesPanel() {
  const busy = useAppStore((s) => s.busy);
  const palette = useSceneStore((s) => s.palette);
  const [kind, setKind] = useState<Kind>('box');
  const [x, setX] = useState(20);
  const [y, setY] = useState(20);
  const [z, setZ] = useState(20);
  const [seg, setSeg] = useState(64);
  const [color, setColor] = useState(0);
  return (
    <div className="flex flex-col gap-1">
      <Segmented<Kind> label="Primitive" value={kind} onChange={setKind} options={[{ value: 'box', label: 'Box' }, { value: 'cylinder', label: 'Cylinder' }, { value: 'sphere', label: 'Sphere' }, { value: 'cone', label: 'Cone' }]} />
      {kind === 'box' && (
        <>
          <FieldRow label="Width (X)" htmlFor="pr-x"><NumberInput id="pr-x" value={x} min={0.01} max={1e5} suffix="mm" onCommit={setX} /></FieldRow>
          <FieldRow label="Depth (Y)" htmlFor="pr-y"><NumberInput id="pr-y" value={y} min={0.01} max={1e5} suffix="mm" onCommit={setY} /></FieldRow>
        </>
      )}
      {kind !== 'box' && <FieldRow label={kind === 'cone' ? 'Bottom diameter' : 'Diameter'} htmlFor="pr-x"><NumberInput id="pr-x" value={x} min={0.01} max={1e5} suffix="mm" onCommit={setX} /></FieldRow>}
      {kind === 'cone' && <FieldRow label="Top diameter" htmlFor="pr-y"><NumberInput id="pr-y" value={y} min={0} max={1e5} suffix="mm" onCommit={setY} /></FieldRow>}
      {kind !== 'sphere' && <FieldRow label="Height (Z)" htmlFor="pr-z"><NumberInput id="pr-z" value={z} min={0.01} max={1e5} suffix="mm" onCommit={setZ} /></FieldRow>}
      {kind !== 'box' && <FieldRow label="Segments" htmlFor="pr-seg"><NumberInput id="pr-seg" integer value={seg} min={3} max={512} onCommit={setSeg} /></FieldRow>}
      <FieldRow label="Colour">
        <div className="flex flex-wrap gap-1">
          {palette.slice(0, 8).map((c, i) => (
            <button key={c + i} type="button" aria-label={`Colour ${c}`} aria-pressed={color === i} onClick={() => setColor(i)} className={`h-5 w-5 rounded border ${color === i ? 'border-ink ring-2 ring-accent-hi' : 'border-line-strong'}`} style={{ background: c }} />
          ))}
        </div>
      </FieldRow>
      <Button variant="primary" className="mt-1 w-full" disabled={!!busy} onClick={() => void addPrimitive(kind, [x, kind === 'cone' ? y : kind === 'box' ? y : x, z], seg, color)}>
        Add {kind}
      </Button>
    </div>
  );
}
