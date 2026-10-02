import { useEffect, useMemo, useRef, useState } from 'react';
import { Matrix3, Matrix4, Vector3 } from 'three';
import { useAppStore } from '../../store/useAppStore';
import { useSceneStore } from '../../store/useSceneStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { formatLength, mmToUnit, unitToMm } from '../../settings/units';
import { objectMatrix } from '../../scene/geometry';
import { Button, FieldRow, NumberInput, Segmented } from '../../ui/primitives';
import { transformObjects } from '../tools/transformOps';
import { measure, useMeasureStore, type WorldFeature } from './featureMeasure';

type V3 = [number, number, number];
type Axis = 0 | 1 | 2;
const AXES = ['X', 'Y', 'Z'] as const;

/** A measured length that can be typed over. `dir` is the measured vector (exact one-axis solve); `axis` marks an X/Y/Z component. */
interface Measured {
  key: string;
  label: string;
  value: number;
  dir?: Vector3;
  axis?: Axis;
  /** Circle: its plane normal (one-axis stretch should be in the plane). */
  normal?: Vector3;
}

const vec = (p: V3) => new Vector3(...p);

/** Values the user can retarget, headline first. */
export function measuredValues(picks: WorldFeature[]): Measured[] {
  const out: Measured[] = [];
  if (picks.length === 2) {
    const r = measure(picks[0]!, picks[1]!, (mm) => String(mm));
    if (r.segment && r.distance != null && r.distance > 1e-6) {
      const d = vec(r.segment[1]).sub(vec(r.segment[0]));
      out.push({ key: 'dist', label: 'Distance', value: r.distance, dir: d });
      d.toArray().forEach((c, i) => {
        if (Math.abs(c) > 1e-4 && Math.abs(Math.abs(c) - r.distance!) > 1e-4) out.push({ key: `d${i}`, label: `Distance ${AXES[i]}`, value: Math.abs(c), axis: i as Axis });
      });
    }
    picks.forEach((f, i) => {
      if (f.type === 'circle') out.push({ key: `dia${i}`, label: `Diameter (${i ? 'second' : 'first'} pick)`, value: f.radius * 2, normal: vec(f.normal) });
    });
  } else if (picks.length === 1) {
    const f = picks[0]!;
    if (f.type === 'edge') {
      const d = vec(f.b).sub(vec(f.a));
      out.push({ key: 'len', label: 'Edge length', value: d.length(), dir: d });
    }
    if (f.type === 'circle') {
      out.push({ key: 'dia', label: 'Diameter', value: f.radius * 2, normal: vec(f.normal) });
      if (f.cylinder) out.push({ key: 'cyl', label: 'Wall length', value: f.cylinder.length, dir: vec(f.normal).multiplyScalar(f.cylinder.length) });
    }
  }
  return out;
}

/** Axis the stretch should use by default: the one the measurement mostly runs along. */
function defaultAxis(m: Measured): Axis {
  if (m.axis != null) return m.axis;
  if (m.dir) {
    const a = m.dir.toArray().map(Math.abs);
    return a.indexOf(Math.max(...a)) as Axis;
  }
  if (m.normal) {
    const a = m.normal.toArray().map(Math.abs);
    return a.indexOf(Math.min(...a)) as Axis; // most in-plane axis
  }
  return 0;
}

/** World scale factors that turn `m.value` into `target`, or an explanation why one axis cannot do it. */
export function factorsFor(m: Measured, target: number, uniform: boolean, axis: Axis): { k: V3 } | { error: string } {
  if (!(target > 0)) return { error: 'Enter a size above zero.' };
  const ratio = target / m.value;
  if (uniform) return { k: [ratio, ratio, ratio] };
  const k: V3 = [1, 1, 1];
  if (m.axis != null) {
    if (m.axis !== axis) return { error: `This value runs along ${AXES[m.axis]}; stretching ${AXES[axis]} does not change it.` };
    k[axis] = ratio;
    return { k };
  }
  if (m.dir) {
    // |d'|² = L² − dᵢ² + (k·dᵢ)²  →  k = √(T² − L² + dᵢ²) / |dᵢ|
    const L = m.dir.length(), di = Math.abs(m.dir.getComponent(axis));
    if (di < 1e-6 * Math.max(L, 1)) return { error: `This measurement has no ${AXES[axis]} component, so stretching ${AXES[axis]} cannot change it.` };
    const inside = target * target - L * L + di * di;
    if (inside <= 0) return { error: `Stretching only ${AXES[axis]} cannot make it shorter than ${(Math.sqrt(L * L - di * di)).toFixed(2)} mm. Use another axis or Uniform.` };
    k[axis] = Math.sqrt(inside) / di;
    return { k };
  }
  if (m.normal && Math.abs(m.normal.getComponent(axis)) > 0.99) return { error: `The circle faces ${AXES[axis]}; stretching ${AXES[axis]} does not change its diameter.` };
  k[axis] = ratio; // circle → ellipse; its diameter along that axis becomes the target
  return { k };
}

/** Moves picked features of `objectId` along with an object transform (world delta matrix), so the measurement stays live. */
function mapFeature(f: WorldFeature, d: Matrix4): WorldFeature {
  const nm = new Matrix3().getNormalMatrix(d);
  const p = (v: V3) => vec(v).applyMatrix4(d).toArray() as V3;
  const n = (v: V3) => vec(v).applyMatrix3(nm).normalize().toArray() as V3;
  const lin = new Matrix3().setFromMatrix4(d);
  const stretch = (v: Vector3) => v.clone().applyMatrix3(lin).length() / (v.length() || 1);
  if (f.type === 'point') return { ...f, p: p(f.p) };
  if (f.type === 'edge') return { ...f, a: p(f.a), b: p(f.b), ...(f.center ? { center: p(f.center) } : {}) };
  if (f.type === 'circle') {
    const nv = vec(f.normal);
    const u = new Vector3(1, 0, 0).cross(nv);
    if (u.lengthSq() < 1e-6) u.set(0, 1, 0).cross(nv);
    const w = nv.clone().cross(u);
    const s = (stretch(u) + stretch(w)) / 2;
    return { ...f, center: p(f.center), normal: n(f.normal), radius: f.radius * s, ...(f.cylinder ? { cylinder: { length: f.cylinder.length * stretch(nv) } } : {}) };
  }
  return { ...f, origin: p(f.origin), normal: n(f.normal), area: undefined };
}

/** "Scale to a new size": type over a measured value and the object is scaled to match (uniform or one axis). */
export function ScaleToMeasure() {
  const unit = useSettingsStore((s) => s.units);
  const picks = useMeasureStore((s) => s.picks);
  const objects = useSceneStore((s) => s.objects);
  const options = useMemo(() => measuredValues(picks), [picks]);
  const [key, setKey] = useState('');
  const m = options.find((o) => o.key === key) ?? options[0];
  const [uniform, setUniform] = useState(true);
  const [axis, setAxis] = useState<Axis>(0);
  const [target, setTarget] = useState<number | null>(null);
  const ids = [...new Set(picks.map((p) => p.objectId))].filter((id) => objects.some((o) => o.id === id));
  const [who, setWho] = useState('');
  const objectId = ids.includes(who) ? who : ids[0];

  // new measurement → start from its current value and its natural axis
  useEffect(() => setTarget(null), [picks, m?.key]);
  // a new measurement picks its natural axis; our own re-measure after scaling keeps the user's choice
  const ownUpdate = useRef(false);
  useEffect(() => {
    if (ownUpdate.current) {
      ownUpdate.current = false;
      return;
    }
    if (m) setAxis(defaultAxis(m));
  }, [m?.key, picks]); // eslint-disable-line

  if (!m || !objectId) return null;
  const value = target ?? m.value;
  const plan = factorsFor(m, value, uniform, axis);
  const name = (id: string) => objects.find((o) => o.id === id)?.name ?? 'object';

  const apply = () => {
    if (!('k' in plan)) return;
    const before = objects.find((o) => o.id === objectId);
    if (!before) return;
    const oldM = objectMatrix(before);
    const what = uniform ? 'uniformly' : `along ${AXES[axis]}`;
    transformObjects([objectId], `Scale ${before.name} to ${formatLength(value, unit)} ${what}`, new Matrix4().makeScale(...plan.k));
    const after = useSceneStore.getState().objects.find((o) => o.id === objectId);
    if (!after) return;
    const delta = objectMatrix(after).multiply(oldM.invert());
    const st = useMeasureStore.getState();
    const next = st.picks.map((f) => (f.objectId === objectId ? mapFeature(f, delta) : f));
    ownUpdate.current = true;
    st.set({ picks: next });
    const now = measuredValues(next).find((o) => o.key === m.key)?.value;
    const pct = plan.k.map((x) => `${(x * 100).toFixed(1)}%`);
    useAppStore.getState().setReady(`Scaled ${before.name} ${uniform ? pct[0] : `${AXES[axis]} ${pct[axis]}`}${now != null ? ` — ${m.label.toLowerCase()} is now ${formatLength(now, unit)}` : ''}`);
    setTarget(null);
  };

  return (
    <div className="flex flex-col gap-1 rounded-md border border-line px-2 py-1.5 text-[12.5px]" data-testid="measure-scale">
      <b className="text-[12px] uppercase tracking-[0.5px] text-muted">Scale to a new size</b>
      {options.length > 1 && (
        <FieldRow label="Value" htmlFor="ms-val">
          <select id="ms-val" value={m.key} onChange={(e) => setKey(e.target.value)} className="min-w-0 rounded-[7px] border border-line bg-surface-2 px-2 py-1 text-[13px]">
            {options.map((o) => <option key={o.key} value={o.key}>{`${o.label}: ${formatLength(o.value, unit)}`}</option>)}
          </select>
        </FieldRow>
      )}
      <FieldRow label={options.length > 1 ? 'New value' : `New ${m.label.toLowerCase()}`} htmlFor="ms-target" hint={`Now ${formatLength(m.value, unit)}`}>
        <NumberInput id="ms-target" value={mmToUnit(value, unit)} min={mmToUnit(0.001, unit)} max={mmToUnit(1e6, unit)} suffix={unit} onCommit={(v) => setTarget(unitToMm(v, unit))} />
      </FieldRow>
      <FieldRow label="Scale">
        <Segmented label="Scale how" value={uniform ? 'uniform' : 'axis'} onChange={(v) => setUniform(v === 'uniform')} options={[{ value: 'uniform', label: 'Uniform' }, { value: 'axis', label: 'One axis' }]} />
      </FieldRow>
      {!uniform && (
        <FieldRow label="Axis">
          <Segmented label="Stretch axis" value={AXES[axis]} onChange={(v) => setAxis(AXES.indexOf(v) as Axis)} options={AXES.map((a) => ({ value: a, label: a }))} />
        </FieldRow>
      )}
      {ids.length > 1 && (
        <FieldRow label="Object to scale" htmlFor="ms-obj">
          <select id="ms-obj" value={objectId} onChange={(e) => setWho(e.target.value)} className="min-w-0 rounded-[7px] border border-line bg-surface-2 px-2 py-1 text-[13px]">
            {ids.map((id) => <option key={id} value={id}>{name(id)}</option>)}
          </select>
        </FieldRow>
      )}
      {'error' in plan ? (
        <p className="m-0 text-[12px] text-err" data-testid="measure-scale-error">{plan.error}</p>
      ) : (
        <p className="m-0 text-[12px] text-muted" data-testid="measure-scale-factor">
          {uniform ? `All axes × ${plan.k[0].toFixed(4)}` : `${AXES[axis]} × ${plan.k[axis].toFixed(4)}, other axes unchanged`}
          {ids.length > 1 ? ' · the measured gap between two objects will not match exactly' : ''}
          {!uniform && m.normal && m.dir == null ? ' · the circle becomes an oval' : ''}
        </p>
      )}
      <Button variant="primary" className="w-full" data-testid="measure-scale-apply" disabled={!('k' in plan) || Math.abs(value - m.value) < 1e-9} onClick={apply}>
        Scale {name(objectId)}
      </Button>
    </div>
  );
}
