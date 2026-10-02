import { useState } from 'react';
import { Vector3 } from 'three';
import { useAppStore } from '../../store/useAppStore';
import { selectedObjects, useSceneStore } from '../../store/useSceneStore';
import { worldBox } from '../../scene/geometry';
import { createObject } from '../../scene/create';
import { kernel, kernelMesh } from '../../geometry/kernel';
import type { KernelMesh } from '../../geometry/protocol';
import { Button, FieldRow, NumberInput, Segmented, SwitchInput } from '../../ui/primitives';

type Axis = 'x' | 'y' | 'z';

export async function drillSelected(opts: { axis: Axis; offsetA: number; offsetB: number; diameter: number; depth: number; countersink: boolean }) {
  const s = useSceneStore.getState();
  const o = selectedObjects(s)[0];
  if (!o) return;
  const c = worldBox(o).getCenter(new Vector3());
  // offsets are along the two axes perpendicular to the hole axis, from the object centre
  const center: [number, number, number] = [c.x, c.y, c.z];
  const [ia, ib] = (opts.axis === 'x' ? [1, 2] : opts.axis === 'y' ? [0, 2] : [0, 1]) as [0 | 1 | 2, 0 | 1 | 2];
  center[ia] += opts.offsetA;
  center[ib] += opts.offsetB;
  const res = await useAppStore.getState().run('Drill', () =>
    kernel<{ mesh: KernelMesh }>('drill', { mesh: kernelMesh(o), axis: opts.axis, center, diameter: opts.diameter, depth: opts.depth, countersink: opts.countersink, paletteSize: s.palette.length }),
  );
  if (!res) return;
  const out = createObject(o.name, res.mesh.positions, res.mesh.faceColors, { kind: 'tool' }, 'keep');
  s.replaceObjects(`Drill ${opts.diameter} mm hole`, [o.id], [{ ...out, id: o.id }]);
  useAppStore.getState().setReady(`Drilled a ${opts.diameter} mm hole`);
}

/** STL Studio "Drill Hole" port, done natively with Manifold. */
export function DrillPanel() {
  const target = useSceneStore((s) => (s.selectedIds.length === 1 ? selectedObjects(s)[0] : undefined));
  const busy = useAppStore((s) => s.busy);
  const [axis, setAxis] = useState<Axis>('z');
  const [a, setA] = useState(0);
  const [b, setB] = useState(0);
  const [d, setD] = useState(3.4);
  const [depth, setDepth] = useState(0);
  const [cs, setCs] = useState(false);
  if (!target) return <p className="m-0 text-[12.5px] text-muted">Select one watertight object to drill a hole through it.</p>;
  const labels = axis === 'x' ? ['Y', 'Z'] : axis === 'y' ? ['X', 'Z'] : ['X', 'Y'];
  return (
    <div className="flex flex-col gap-1">
      <FieldRow label="Direction">
        <Segmented<Axis> label="Hole axis" value={axis} onChange={setAxis} options={[{ value: 'z', label: 'Z (down)' }, { value: 'x', label: 'X' }, { value: 'y', label: 'Y' }]} />
      </FieldRow>
      <FieldRow label={`${labels[0]} from centre`} htmlFor="dr-a"><NumberInput id="dr-a" value={a} min={-1e4} max={1e4} suffix="mm" onCommit={setA} /></FieldRow>
      <FieldRow label={`${labels[1]} from centre`} htmlFor="dr-b"><NumberInput id="dr-b" value={b} min={-1e4} max={1e4} suffix="mm" onCommit={setB} /></FieldRow>
      <FieldRow label="Diameter" htmlFor="dr-d"><NumberInput id="dr-d" value={d} min={0.2} max={500} suffix="mm" onCommit={setD} /></FieldRow>
      <FieldRow label="Depth" htmlFor="dr-depth" hint="0 = all the way through"><NumberInput id="dr-depth" value={depth} min={0} max={1e4} suffix="mm" onCommit={setDepth} /></FieldRow>
      <FieldRow label="Countersink" htmlFor="dr-cs"><SwitchInput id="dr-cs" checked={cs} onChange={setCs} /></FieldRow>
      <Button variant="primary" className="mt-1 w-full" disabled={!!busy} onClick={() => void drillSelected({ axis, offsetA: a, offsetB: b, diameter: d, depth, countersink: cs })}>
        Drill hole
      </Button>
    </div>
  );
}
