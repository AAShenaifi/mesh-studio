import { useEffect } from 'react';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { useAppStore } from '../../store/useAppStore';
import { droppedToGrid, selectedObjects, useSceneStore, withWorldTransform } from '../../store/useSceneStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { worldBox } from '../../scene/geometry';
import { createObject } from '../../scene/create';
import type { SceneObject } from '../../scene/types';
import { kernel, kernelMesh } from '../../geometry/kernel';
import type { KernelMesh } from '../../geometry/protocol';
import { mmToUnit, unitToMm } from '../../settings/units';
import { Button, FieldRow, NumberInput, Segmented, SwitchInput } from '../../ui/primitives';
import { cutNormal, quatFor, useCutStore } from './cutStore';
import { grooveDefaults, type ConnectorShape, type ConnectorStyle } from '../../ported/cut/connectors';

const AXES = { x: new Vector3(1, 0, 0), y: new Vector3(0, 1, 0), z: new Vector3(0, 0, 1) } as const;

/** Range of dot(n, x) over the object's world bbox corners. */
function extent(o: SceneObject, n: Vector3): [number, number] {
  const b = worldBox(o);
  let lo = Infinity, hi = -Infinity;
  for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
    const d = n.x * x + n.y * y + n.z * z;
    lo = Math.min(lo, d); hi = Math.max(hi, d);
  }
  return [lo, hi];
}

export function resetPlane(o: SceneObject, axis: Vector3) {
  const b = worldBox(o);
  const c = b.getCenter(new Vector3());
  const size = b.getSize(new Vector3());
  const st = useCutStore.getState();
  const g = grooveDefaults([size.x, size.y, size.z]);
  const r = (v: number) => Math.round(v * 10) / 10;
  st.set({
    position: c.toArray() as [number, number, number],
    quaternion: quatFor(axis),
    groove: { ...st.groove, depth: r(g.depth), width: r(g.width) },
  });
  st.setConnectors({ points: [] });
}

/** Rotates an object so the given world direction points straight down, then drops it to the grid. */
function faceDown(o: SceneObject, dir: Vector3): SceneObject {
  const q = new Quaternion().setFromUnitVectors(dir.clone().normalize(), new Vector3(0, 0, -1));
  const c = worldBox(o).getCenter(new Vector3());
  const m = new Matrix4().makeTranslation(c.x, c.y, c.z).multiply(new Matrix4().makeRotationFromQuaternion(q)).multiply(new Matrix4().makeTranslation(-c.x, -c.y, -c.z));
  return droppedToGrid({ ...o, ...withWorldTransform(o, m) });
}

async function runSlabs(target: SceneObject): Promise<boolean> {
  const scene = useSceneStore.getState();
  const st = useCutStore.getState();
  const n = cutNormal(st);
  const res = await useAppStore.getState().run('Slab cut', () =>
    kernel<{ parts: KernelMesh[] }>('slabs', { mesh: kernelMesh(target), normal: n.toArray(), count: st.slabs, gap: st.gap, paletteSize: scene.palette.length }),
  );
  if (!res) return false;
  const made = res.parts.map((p, i) => createObject(`${target.name} slab ${i + 1}`, p.positions, p.faceColors, { kind: 'cut' }, 'keep'));
  scene.replaceObjects(`Cut ${target.name} into ${made.length} slabs`, [target.id], made);
  useAppStore.getState().setReady(`Cut ${target.name} into ${made.length} slabs`);
  useAppStore.getState().setActiveTool(null);
  useAppStore.getState().requestCamera('fit', 'selection');
  return true;
}

export async function runCut(): Promise<boolean> {
  const scene = useSceneStore.getState();
  const target = selectedObjects(scene)[0];
  if (!target) return false;
  const st = useCutStore.getState();
  if (st.mode === 'plane' && st.slabs > 1) return runSlabs(target);
  const n = cutNormal(st);
  const offset = n.dot(new Vector3(...st.position));
  // manual connector points follow the plane if it moved after they were placed
  const points = st.connectors.points.map((p) => new Vector3(...p).addScaledVector(n, offset - n.dot(new Vector3(...p))).toArray());
  const res = await useAppStore.getState().run(st.mode === 'dovetail' ? 'Dovetail cut' : 'Cut', () =>
    kernel<{ above: KernelMesh; below: KernelMesh; pins: KernelMesh[] }>('cut', {
      mesh: kernelMesh(target),
      normal: n.toArray(),
      offset,
      origin: st.position,
      gap: st.gap,
      capColor: null,
      connectors: { ...st.connectors, points },
      groove: st.mode === 'dovetail' ? st.groove : null,
      paletteSize: scene.palette.length,
    }),
  );
  if (!res) return false;
  const src = { kind: 'cut' as const };
  let above = createObject(`${target.name} (top)`, res.above.positions, res.above.faceColors, src, 'keep');
  let below = createObject(`${target.name} (bottom)`, res.below.positions, res.below.faceColors, src, 'keep');
  if (st.layFlat) {
    below = faceDown(below, n.clone()); // its cut face points along +n
    above = faceDown(above, n.clone().negate());
    const bb = worldBox(below);
    const ab = worldBox(above);
    const shift = bb.max.x + 8 - ab.min.x;
    above = { ...above, position: [above.position[0] + shift, above.position[1] + (bb.getCenter(new Vector3()).y - ab.getCenter(new Vector3()).y), above.position[2]] };
  }
  const made = st.keep === 'upper' ? [above] : st.keep === 'lower' ? [below] : [below, above];
  const others = useSceneStore.getState().objects.filter((o) => o.id !== target.id);
  res.pins.forEach((p, i) => {
    // Each pin goes beside everything placed so far, standing on the grid.
    made.push(droppedToGrid(createObject(`${target.name} dowel ${i + 1}`, p.positions, p.faceColors, { kind: 'cut' }, 'beside', [...others, ...made])));
  });
  const pins = res.pins;
  scene.replaceObjects(`Cut ${target.name}`, [target.id], made);
  useAppStore.getState().setReady(`Cut ${target.name}${st.keep === 'both' ? ' into 2 parts' : `, kept the ${st.keep} part`}${pins.length ? ` + ${pins.length} dowel${pins.length > 1 ? 's' : ''}` : ''}`);
  useCutStore.getState().setConnectors({ points: [] });
  useAppStore.getState().setActiveTool(null);
  useAppStore.getState().requestCamera('fit', 'selection');
  return true;
}

export function CutPanel() {
  const active = useAppStore((s) => s.activeTool === 'cut');
  const setActiveTool = useAppStore((s) => s.setActiveTool);
  const busy = useAppStore((s) => s.busy);
  const target = useSceneStore((s) => (s.selectedIds.length === 1 ? selectedObjects(s)[0] : undefined));
  const st = useCutStore();
  const unit = useSettingsStore((s) => s.units);

  useEffect(() => {
    if (active && !target) setActiveTool(null);
  }, [active, target, setActiveTool]);

  if (!target) return <p className="m-0 text-[12.5px] text-muted">Select one object to cut it with a plane. Both halves are kept as separate, watertight objects.</p>;
  if (!active)
    return (
      <Button
        variant="primary"
        className="w-full"
        onClick={() => {
          resetPlane(target, AXES.z);
          setActiveTool('cut');
        }}
      >
        Start cut on “{target.name}”
      </Button>
    );

  const n = cutNormal(st);
  const [lo, hi] = extent(target, n);
  const offset = n.dot(new Vector3(...st.position));
  const setOffset = (v: number) => {
    const p = new Vector3(...st.position);
    p.addScaledVector(n, v - p.dot(n));
    st.set({ position: p.toArray() as [number, number, number] });
  };
  const axisName = (['x', 'y', 'z'] as const).find((a) => Math.abs(AXES[a].dot(n)) > 0.9999) ?? 'custom';
  const pct = hi > lo ? ((offset - lo) / (hi - lo)) * 100 : 50;

  return (
    <div className="flex flex-col gap-1" data-testid="cut-panel">
      <FieldRow label="Plane normal">
        <Segmented
          label="Plane normal"
          value={axisName}
          onChange={(a) => a !== 'custom' && resetPlane(target, AXES[a])}
          options={[
            { value: 'x', label: 'X' },
            { value: 'y', label: 'Y' },
            { value: 'z', label: 'Z' },
            ...(axisName === 'custom' ? [{ value: 'custom' as const, label: 'Tilted' }] : []),
          ]}
        />
      </FieldRow>
      <Button variant={st.drawing ? 'primary' : 'default'} onClick={() => st.set({ drawing: !st.drawing })}>
        {st.drawing ? 'Drag across the view to draw the cut… (Esc)' : 'Draw the cut line on screen'}
      </Button>
      <FieldRow label="Gizmo">
        <Segmented label="Cut gizmo" value={st.gizmo} onChange={(g) => st.set({ gizmo: g })} options={[{ value: 'translate', label: 'Slide' }, { value: 'rotate', label: 'Tilt' }]} />
      </FieldRow>
      <label className="text-xs font-semibold text-muted" htmlFor="cut-offset">
        Position along normal ({Math.round(pct)}% of the object)
      </label>
      <input
        id="cut-offset"
        type="range"
        min={lo}
        max={hi}
        step={(hi - lo) / 500 || 0.01}
        value={offset}
        onChange={(e) => setOffset(+e.target.value)}
        className="w-full accent-accent-hi"
      />
      <FieldRow label="Plane offset" htmlFor="cut-offset-num">
        <NumberInput id="cut-offset-num" value={mmToUnit(offset, unit)} min={mmToUnit(lo, unit)} max={mmToUnit(hi, unit)} suffix={unit} onCommit={(v) => setOffset(unitToMm(v, unit))} />
      </FieldRow>
      <FieldRow label="Gap between halves" htmlFor="cut-gap">
        <NumberInput id="cut-gap" value={mmToUnit(st.gap, unit)} min={0} max={mmToUnit(1000, unit)} suffix={unit} onCommit={(v) => st.set({ gap: unitToMm(v, unit) })} />
      </FieldRow>
      <FieldRow label="Keep">
        <Segmented label="Keep parts" value={st.keep} onChange={(k) => st.set({ keep: k })} options={[{ value: 'both', label: 'Both' }, { value: 'upper', label: 'Upper' }, { value: 'lower', label: 'Lower' }]} />
      </FieldRow>
      <FieldRow label="Lay halves flat" htmlFor="cut-flat" hint="Put each cut face on the grid, ready to print.">
        <SwitchInput id="cut-flat" checked={st.layFlat} onChange={(v) => st.set({ layFlat: v })} />
      </FieldRow>
      <FieldRow label="Cut type">
        <Segmented label="Cut type" value={st.mode} onChange={(m) => st.set({ mode: m })} options={[{ value: 'plane', label: 'Plane' }, { value: 'dovetail', label: 'Dovetail' }]} />
      </FieldRow>
      {st.mode === 'plane' && (
        <FieldRow label="Slabs" htmlFor="cut-slabs" hint={st.slabs > 1 ? 'Equal slices along the normal (plane position ignored)' : '1 = one cut at the plane'}>
          <NumberInput id="cut-slabs" value={st.slabs} min={1} max={200} integer onCommit={(v) => st.set({ slabs: v })} />
        </FieldRow>
      )}
      {st.mode === 'dovetail' ? <DovetailFields /> : st.slabs > 1 ? null : <ConnectorFields />}
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <Button onClick={() => setActiveTool(null)}>Cancel</Button>
        <Button variant="primary" disabled={!!busy} onClick={() => void runCut()}>
          Cut
        </Button>
      </div>
    </div>
  );
}


const SHAPES: Array<{ value: ConnectorShape; label: string }> = [
  { value: 'circle', label: 'Circle' },
  { value: 'square', label: 'Square' },
  { value: 'hexagon', label: 'Hexagon' },
  { value: 'triangle', label: 'Triangle' },
];

function ConnectorFields() {
  const c = useCutStore((s) => s.connectors);
  const setC = useCutStore((s) => s.setConnectors);
  return (
    <>
      <FieldRow label="Connectors">
        <Segmented label="Connectors" value={c.type} onChange={(type) => setC({ type })} options={[{ value: 'none', label: 'None' }, { value: 'plug', label: 'Plug' }, { value: 'snap', label: 'Snap' }, { value: 'dowel', label: 'Dowel' }]} />
      </FieldRow>
      {c.type !== 'none' && (
        <>
          <FieldRow label="Placement" hint={c.placement === 'manual' ? `${c.points.length} placed: click the cut face` : undefined}>
            <Segmented
              label="Connector placement"
              value={c.placement}
              onChange={(placement) => setC({ placement })}
              options={[{ value: 'auto1', label: '1' }, { value: 'auto2', label: '2' }, { value: 'manual', label: 'Click' }]}
            />
          </FieldRow>
          {c.placement === 'manual' && c.points.length > 0 && (
            <Button onClick={() => setC({ points: c.points.slice(0, -1) })}>Remove last connector</Button>
          )}
          {c.type === 'snap' && <p className="m-0 text-xs text-muted">Snap-fit: a slotted, barbed plug on the lower part clicks into a socket with a groove in the upper part (round only).</p>}
          {c.type !== 'snap' && (<>
          <FieldRow label="Shape">
            <select aria-label="Connector shape" value={c.shape} onChange={(e) => setC({ shape: e.target.value as ConnectorShape })} className="rounded-[7px] border border-line bg-surface-2 px-2 py-1 text-[13px]">
              {SHAPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </FieldRow>
          <FieldRow label="Style">
            <Segmented<ConnectorStyle> label="Connector style" value={c.style} onChange={(style) => setC({ style })} options={[{ value: 'prism', label: 'Prism' }, { value: 'frustum', label: 'Frustum' }]} />
          </FieldRow>
          </>)}
          <FieldRow label="Size (diameter)" htmlFor="pin-d">
            <NumberInput id="pin-d" value={c.size} min={1} max={60} suffix="mm" onCommit={(size) => setC({ size })} />
          </FieldRow>
          <FieldRow label={c.type === 'plug' ? 'Plug height' : 'Hole depth (each half)'} htmlFor="pin-depth">
            <NumberInput id="pin-depth" value={c.depth} min={0.5} max={100} suffix="mm" onCommit={(depth) => setC({ depth })} />
          </FieldRow>
          <FieldRow label="Clearance (radius)" htmlFor="pin-clear" hint="Hole is this much wider per side">
            <NumberInput id="pin-clear" value={c.sizeTolerance} min={0} max={2} suffix="mm" onCommit={(sizeTolerance) => setC({ sizeTolerance })} />
          </FieldRow>
          <FieldRow label="Extra depth" htmlFor="pin-depth-tol" hint="Hole is this much deeper">
            <NumberInput id="pin-depth-tol" value={c.depthTolerance} min={0} max={5} suffix="mm" onCommit={(depthTolerance) => setC({ depthTolerance })} />
          </FieldRow>
          {c.shape !== 'circle' && (
            <FieldRow label="Rotation" htmlFor="pin-rot">
              <NumberInput id="pin-rot" value={c.rotation} min={-180} max={180} suffix="°" onCommit={(rotation) => setC({ rotation })} />
            </FieldRow>
          )}
          {c.type === 'dowel' && (
            <FieldRow label="Also create the dowels" htmlFor="pin-make">
              <SwitchInput id="pin-make" checked={c.makeDowels} onChange={(makeDowels) => setC({ makeDowels })} />
            </FieldRow>
          )}
        </>
      )}
    </>
  );
}

function DovetailFields() {
  const g = useCutStore((s) => s.groove);
  const set = useCutStore((s) => s.set);
  const up = (patch: Partial<typeof g>) => set({ groove: { ...g, ...patch } });
  return (
    <>
      <p className="m-0 text-xs text-muted">The upper part gets a dovetail tongue, the lower part the matching groove; they slide together along the groove.</p>
      <FieldRow label="Depth" htmlFor="dt-depth">
        <NumberInput id="dt-depth" value={g.depth} min={0.5} max={200} suffix="mm" onCommit={(depth) => up({ depth })} />
      </FieldRow>
      <FieldRow label="Width (narrow end)" htmlFor="dt-width">
        <NumberInput id="dt-width" value={g.width} min={0.5} max={500} suffix="mm" onCommit={(width) => up({ width })} />
      </FieldRow>
      <FieldRow label="Flap angle" htmlFor="dt-flaps" hint="90° = straight sides">
        <NumberInput id="dt-flaps" value={g.flapsAngle} min={20} max={90} suffix="°" onCommit={(flapsAngle) => up({ flapsAngle })} />
      </FieldRow>
      <FieldRow label="Groove direction" htmlFor="dt-angle">
        <NumberInput id="dt-angle" value={g.angle} min={-180} max={180} suffix="°" onCommit={(angle) => up({ angle })} />
      </FieldRow>
      <FieldRow label="Depth tolerance" htmlFor="dt-dtol">
        <NumberInput id="dt-dtol" value={g.depthTolerance} min={0} max={2} suffix="mm" onCommit={(depthTolerance) => up({ depthTolerance })} />
      </FieldRow>
      <FieldRow label="Width tolerance" htmlFor="dt-wtol">
        <NumberInput id="dt-wtol" value={g.widthTolerance} min={0} max={2} suffix="mm" onCommit={(widthTolerance) => up({ widthTolerance })} />
      </FieldRow>
    </>
  );
}
