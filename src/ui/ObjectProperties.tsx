import { Vector3 } from 'three';
import { useEffect, useState } from 'react';
import { selectedObjects, useSceneStore } from '../store/useSceneStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { boxOf, worldBox } from '../scene/geometry';
import { triCount, type SceneObject, type Vec3 } from '../scene/types';
import { formatLength, mmToUnit, unitToMm, type Unit } from '../settings/units';
import { Button, NumberInput, SwitchInput } from './primitives';
import { applyNegatives } from '../features/meshTools/negatives';

const AXES = ['X', 'Y', 'Z'] as const;
const AXIS_COLOR = ['text-axis-x', 'text-axis-y', 'text-axis-z'] as const;
const RAD = Math.PI / 180;

function Vec3Row({ label, value, onCommit, unit, min = -1e6, max = 1e6, idPrefix }: { label: string; value: Vec3; onCommit: (axis: number, v: number) => void; unit?: string; min?: number; max?: number; idPrefix: string }) {
  return (
    <div className="py-1">
      <div className="mb-0.5 flex justify-between text-xs font-semibold text-muted">
        <span>{label}</span>
        {unit && <span className="text-faint">{unit}</span>}
      </div>
      <div className="grid grid-cols-3 gap-1">
        {AXES.map((a, i) => (
          <label key={a} className="flex items-center gap-1">
            <span className={`w-2.5 text-[11px] font-bold ${AXIS_COLOR[i]}`}>{a}</span>
            <NumberInput id={`${idPrefix}-${a.toLowerCase()}`} label={`${label} ${a}`} value={value[i]!} min={min} max={max} onCommit={(v) => onCommit(i, v)} compact />
          </label>
        ))}
      </div>
    </div>
  );
}

export function Dimensions({ size, unit }: { size: Vec3; unit: Unit }) {
  return (
    <dl className="m-0 grid grid-cols-3 gap-1.5" aria-label="Dimensions">
      {AXES.map((axis, i) => (
        <div key={axis} className="rounded-[7px] border border-line bg-surface-2 px-2.5 py-1.5">
          <dt className={`text-[11px] font-bold uppercase tracking-[0.6px] ${AXIS_COLOR[i]}`}>{axis}</dt>
          <dd className="m-0 truncate font-mono text-[13px] font-bold" title={formatLength(size[i]!, unit)}>
            {formatLength(size[i]!, unit, false)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function SingleObject({ o, unit }: { o: SceneObject; unit: Unit }) {
  const { updateObject, dropSelectedToGrid, centerSelected } = useSceneStore.getState();
  const [uniform, setUniform] = useState(true);
  const [name, setName] = useState(o.name);
  useEffect(() => setName(o.name), [o.name]);
  const box = worldBox(o);
  const size: Vec3 = [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z];
  const localSize = o.geometry.boundingBox!.getSize(new Vector3());
  const base: Vec3 = [localSize.x || 1, localSize.y || 1, localSize.z || 1];

  const setAxis = (key: 'position' | 'rotation' | 'scale', axis: number, v: number, label: string) => {
    // Always start from the latest record: a blur can commit after other edits landed.
    const cur = useSceneStore.getState().objects.find((x) => x.id === o.id);
    if (!cur) return;
    const next = [...cur[key]] as Vec3;
    if (key === 'scale' && uniform) {
      const k = v / (cur.scale[axis] || 1);
      for (let i = 0; i < 3; i++) next[i] = cur.scale[i]! * k;
    } else next[axis] = v;
    if (next.every((x, i) => Math.abs(x - cur[key][i]!) < 1e-12)) return;
    updateObject(label, cur.id, { [key]: next });
  };

  return (
    <div className="flex flex-col gap-1">
      <input
        aria-label="Object name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && name !== o.name && updateObject('Rename', o.id, { name: name.trim() })}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className="mb-1 w-full rounded-[7px] border border-line bg-surface-2 px-2 py-1 text-[13px] font-bold outline-none focus:border-accent-hi"
      />
      <p className="m-0 mb-1 text-xs text-muted">{triCount(o).toLocaleString()} triangles · {o.source.kind === 'file' ? o.source.fileName : o.source.kind}</p>
      <Dimensions size={size} unit={unit} />
      <Vec3Row idPrefix="pos" label="Position" unit={unit} value={o.position.map((v) => mmToUnit(v, unit)) as Vec3} onCommit={(a, v) => setAxis('position', a, unitToMm(v, unit), 'Move')} />
      <Vec3Row idPrefix="rot" label="Rotation" unit="°" value={o.rotation.map((v) => v / RAD) as Vec3} min={-3600} max={3600} onCommit={(a, v) => setAxis('rotation', a, v * RAD, 'Rotate')} />
      <Vec3Row idPrefix="scl" label="Scale" unit="%" value={o.scale.map((v) => v * 100) as Vec3} min={-100000} max={100000} onCommit={(a, v) => v !== 0 && setAxis('scale', a, v / 100, 'Scale')} />
      <Vec3Row
        idPrefix="size"
        label="Size (object axes)"
        unit={unit}
        value={o.scale.map((s, i) => mmToUnit(Math.abs(s) * base[i]!, unit)) as Vec3}
        min={0.0001}
        onCommit={(a, v) => { const cur = useSceneStore.getState().objects.find((x) => x.id === o.id) ?? o; setAxis('scale', a, (Math.sign(cur.scale[a]!) || 1) * (unitToMm(v, unit) / base[a]!), 'Resize'); }}
      />
      <label className="flex items-center justify-between py-1 text-[13px]">
        <span>Uniform scale</span>
        <SwitchInput checked={uniform} onChange={setUniform} label="Uniform scale" />
      </label>
      <div className="mt-1 grid grid-cols-2 gap-1.5">
        <Button onClick={dropSelectedToGrid}>Drop to grid</Button>
        <Button onClick={centerSelected}>Center</Button>
        <Button onClick={() => updateObject('Reset rotation', o.id, { rotation: [0, 0, 0] })}>Reset rotation</Button>
        <Button onClick={() => updateObject('Reset scale', o.id, { scale: [1, 1, 1] })}>Reset scale</Button>
      </div>
      <PartRole o={o} />
    </div>
  );
}

export function ObjectProperties() {
  const objects = useSceneStore((s) => s.objects);
  const selectedIds = useSceneStore((s) => s.selectedIds);
  const unit = useSettingsStore((s) => s.units);
  const sel = selectedObjects({ objects, selectedIds });
  const { dropSelectedToGrid, centerSelected } = useSceneStore.getState();
  if (!sel.length) return <p className="m-0 text-[12.5px] text-muted">Select an object (click it, or pick it in the list). Shift-click adds to the selection.</p>;
  if (sel.length === 1) return <SingleObject o={sel[0]!} unit={unit} />;
  const box = boxOf(sel);
  const size: Vec3 = [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z];
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-[13px] font-bold">{sel.length} objects selected</p>
      <Dimensions size={size} unit={unit} />
      <div className="grid grid-cols-2 gap-1.5">
        <Button onClick={dropSelectedToGrid}>Drop to grid</Button>
        <Button onClick={centerSelected}>Center</Button>
      </div>
    </div>
  );
}

/** Negative-part switch and linked-copy status for one object. */
function PartRole({ o }: { o: SceneObject }) {
  const links = useSceneStore((s) => (o.linkId ? s.objects.filter((x) => x.linkId === o.linkId).length - 1 : 0));
  const update = useSceneStore((s) => s.updateObject);
  return (
    <div className="mt-2 flex flex-col gap-1" data-testid="part-role">
      <label className="flex items-center justify-between py-1 text-[13px]">
        <span title="Kept as its own part; cut out of overlapping objects on export or with Apply">Negative part (cutter)</span>
        <SwitchInput checked={o.role === 'negative'} onChange={(v) => update(v ? 'Make negative part' : 'Make normal part', o.id, { role: v ? 'negative' : undefined })} label="Negative part" />
      </label>
      {o.role === 'negative' && (
        <Button onClick={() => void applyNegatives()}>Apply negative parts now (subtract)</Button>
      )}
      {links > 0 && (
        <div className="flex items-center justify-between gap-2 text-[12.5px] text-muted">
          <span>Linked with {links} other cop{links === 1 ? 'y' : 'ies'}</span>
          <Button onClick={() => update('Unlink copy', o.id, { linkId: undefined, geometry: o.geometry.clone(), faceColors: o.faceColors.slice() })}>Unlink</Button>
        </div>
      )}
    </div>
  );
}
