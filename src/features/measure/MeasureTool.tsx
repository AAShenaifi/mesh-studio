import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { BufferGeometry, DoubleSide, Float32BufferAttribute, OrthographicCamera, PerspectiveCamera, Raycaster, Vector2, Vector3, type Camera, type Mesh } from 'three';
import { useAppStore } from '../../store/useAppStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { meshRegistry, viewportHandlers } from '../../viewport/SceneObjects';
import { formatLength } from '../../settings/units';
import { objectMatrix, worldBox } from '../../scene/geometry';
import { useSceneStore } from '../../store/useSceneStore';
import { originalTriangle } from '../paint/meshQuery';
import { Button, FieldRow, NumberInput, Segmented, SwitchInput } from '../../ui/primitives';
import { ScaleToMeasure } from './ScaleToMeasure';
import { centreOf, describe, hoverLabel, measure, measureViewport, pickFeature, snapPoint, useMeasureStore, type AngleArc, type WorldFeature } from './featureMeasure';

const COLORS = ['#ffd166', '#5ad1a0'];
const HOVER = '#7fd3ff';

/** World size of `px` screen pixels at `distance` from the camera. */
function worldPerPixels(camera: Camera, distance: number, height: number, px: number): number {
  if ((camera as OrthographicCamera).isOrthographicCamera) {
    const c = camera as OrthographicCamera;
    return ((c.top - c.bottom) / c.zoom / height) * px;
  }
  const c = camera as PerspectiveCamera;
  return ((2 * distance * Math.tan(((c.fov ?? 50) * Math.PI) / 360)) / height) * px;
}

function line(points: Vector3[]) {
  return new BufferGeometry().setFromPoints(points);
}

function arcPoints(a: AngleArc): Vector3[] {
  const c = new Vector3(...a.center), u = new Vector3(...a.u), w = new Vector3(...a.w);
  const angle = Math.acos(Math.max(-1, Math.min(1, u.dot(w))));
  const perp = w.clone().addScaledVector(u, -u.dot(w));
  if (perp.lengthSq() < 1e-12) return [];
  perp.normalize();
  const pts: Vector3[] = [];
  for (let i = 0; i <= 32; i++) {
    const t = (angle * i) / 32;
    pts.push(c.clone().addScaledVector(u, Math.cos(t) * a.radius).addScaledVector(perp, Math.sin(t) * a.radius));
  }
  return pts;
}

/** Highlight of one feature (point marker, edge, circle ring + centre, or face). */
function FeatureHighlight({ f, color, r, opacity = 1 }: { f: WorldFeature; color: string; r: number; opacity?: number }) {
  const geom = useMemo(() => {
    if (f.type === 'edge') return line([new Vector3(...f.a), new Vector3(...f.b)]);
    if (f.type === 'circle') {
      const n = new Vector3(...f.normal);
      const u = new Vector3(1, 0, 0).cross(n);
      if (u.lengthSq() < 1e-6) u.set(0, 1, 0).cross(n);
      u.normalize();
      const w = n.clone().cross(u);
      const pts: Vector3[] = [];
      for (let i = 0; i <= 96; i++) {
        const a = (i / 96) * Math.PI * 2;
        pts.push(new Vector3(...f.center).addScaledVector(u, Math.cos(a) * f.radius).addScaledVector(w, Math.sin(a) * f.radius));
      }
      return line(pts);
    }
    if (f.type === 'plane' && f.triangles) {
      const o = useSceneStore.getState().objects.find((x) => x.id === f.objectId);
      if (!o) return null;
      const src = o.geometry.getAttribute('position').array as Float32Array;
      const m = objectMatrix(o);
      const out = new Float32Array(f.triangles.length * 9);
      const t = new Vector3();
      f.triangles.forEach((tri, i) => {
        for (let k = 0; k < 3; k++) {
          t.set(src[tri * 9 + k * 3]!, src[tri * 9 + k * 3 + 1]!, src[tri * 9 + k * 3 + 2]!).applyMatrix4(m);
          out.set([t.x, t.y, t.z], i * 9 + k * 3);
        }
      });
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(out, 3));
      return g;
    }
    return null;
  }, [f]);
  useEffect(() => () => geom?.dispose(), [geom]);
  return (
    <group>
      {f.type === 'point' && (
        <mesh position={f.p} renderOrder={12} raycast={() => {}}>
          <sphereGeometry args={[r * 1.2, 16, 12]} />
          <meshBasicMaterial color={color} depthTest={false} transparent opacity={opacity} />
        </mesh>
      )}
      {f.type === 'edge' && geom && (
        <>
          <lineSegments geometry={geom} renderOrder={11} raycast={() => {}}>
            <lineBasicMaterial color={color} depthTest={false} transparent opacity={opacity} />
          </lineSegments>
          {[f.a, f.b].map((p, i) => (
            <mesh key={i} position={p} renderOrder={11} raycast={() => {}}>
              <sphereGeometry args={[r * 0.6, 10, 8]} />
              <meshBasicMaterial color={color} depthTest={false} transparent opacity={opacity} />
            </mesh>
          ))}
        </>
      )}
      {f.type === 'circle' && geom && (
        <>
          <LoopLine geometry={geom} color={color} opacity={opacity} />
          <mesh position={f.center} renderOrder={11} raycast={() => {}}>
            <sphereGeometry args={[r * 0.7, 12, 8]} />
            <meshBasicMaterial color={color} depthTest={false} transparent opacity={opacity} />
          </mesh>
        </>
      )}
      {f.type === 'plane' && geom && (
        <mesh geometry={geom} renderOrder={9} raycast={() => {}}>
          <meshBasicMaterial color={color} transparent opacity={0.4 * opacity} depthTest={false} side={DoubleSide} polygonOffset polygonOffsetFactor={-2} />
        </mesh>
      )}
    </group>
  );
}

function LoopLine({ geometry, color, opacity = 1 }: { geometry: BufferGeometry; color: string; opacity?: number }) {
  return (
    <lineLoop geometry={geometry} renderOrder={11} raycast={() => {}}>
      <lineBasicMaterial color={color} depthTest={false} transparent opacity={opacity} />
    </lineLoop>
  );
}

/** Open polyline drawn on top of everything. */
function Polyline({ points, color }: { points: Vector3[]; color: string }) {
  const g = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i + 1 < points.length; i++) out.push(...points[i]!.toArray(), ...points[i + 1]!.toArray());
    const s = new BufferGeometry();
    s.setAttribute('position', new Float32BufferAttribute(out, 3));
    return s;
  }, [points]);
  useEffect(() => () => g.dispose(), [g]);
  return (
    <lineSegments geometry={g} renderOrder={12} raycast={() => {}}>
      <lineBasicMaterial color={color} depthTest={false} />
    </lineSegments>
  );
}

const Tag = ({ children, testId, tone = 'pick' }: { children: ReactNode; testId?: string; tone?: 'pick' | 'hover' | 'angle' }) => (
  <div
    data-testid={testId}
    className={`whitespace-nowrap rounded-md px-2 py-0.5 font-mono text-[12px] font-bold shadow ${tone === 'hover' ? 'bg-[#0f2a38] text-[#bfe9ff]' : tone === 'angle' ? 'bg-[#5ad1a0] text-[#06200f]' : 'bg-[#ffd166] text-[#1b1300]'}`}
  >
    {children}
  </div>
);

/**
 * Measure tool (Bambu Studio / PrusaSlicer style): the feature under the cursor is
 * highlighted with its size; a click selects it. Points mode snaps to corners,
 * edge midpoints, hole centres and edges. Shift = free point on the surface,
 * Alt = the whole face.
 */
export function MeasureTool() {
  const active = useAppStore((s) => s.activeTool === 'measure');
  const unit = useSettingsStore((s) => s.units);
  const invalidate = useThree((s) => s.invalidate);
  const gl = useThree((s) => s.gl);
  const getState = useThree((s) => s.get);
  const { mode, picks, hover } = useMeasureStore();
  const lastCircle = useRef<(WorldFeature & { type: 'circle' }) | null>(null);
  const hoverAt = useRef<Vector3 | null>(null);
  const fmt = (mm: number) => formatLength(mm, unit);

  useEffect(() => {
    if (!active) {
      useMeasureStore.getState().set({ picks: [], hover: null });
      lastCircle.current = null;
      return;
    }
    const el = gl.domElement;
    const raycaster = new Raycaster();
    (raycaster as Raycaster & { firstHitOnly?: boolean }).firstHitOnly = true;

    /** Feature under the cursor for the current mode and modifier keys. */
    const featureAt = (clientX: number, clientY: number, shift: boolean, alt: boolean): { f: WorldFeature | null; at: Vector3 | null } => {
      const { camera } = getState();
      const r = el.getBoundingClientRect();
      const ndc = new Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const objects = useSceneStore.getState().objects;
      const meshes: Mesh[] = [];
      for (const o of objects) {
        const m = meshRegistry.get(o.id);
        if (m && o.visible) meshes.push(m);
      }
      const hit = raycaster.intersectObjects(meshes, false)[0];
      // hole centre: stays selectable while the cursor is near it on screen (the hole itself has no surface)
      const lc = lastCircle.current;
      const snapPx = useSettingsStore.getState().measureSnapPx;
      const stSnap = useMeasureStore.getState();
      if (lc && !shift && !alt && stSnap.snapCentres) {
        const sc = new Vector3(...lc.center).project(camera);
        const dx = ((sc.x - ndc.x) / 2) * r.width, dy = ((sc.y - ndc.y) / 2) * r.height;
        const nearer = !hit || hit.point.distanceTo(new Vector3(...lc.center)) < lc.radius * 1.2;
        if (Math.hypot(dx, dy) < snapPx * 1.75 && nearer) return { f: centreOf(lc), at: new Vector3(...lc.center) };
      }
      if (!hit || hit.faceIndex == null) return { f: null, at: null };
      const o = objects.find((x) => x.id === (hit.object.userData as { objectId?: string }).objectId);
      if (!o) return { f: null, at: null };
      const tri = originalTriangle(o.geometry, hit.faceIndex);
      const limit = worldPerPixels(camera, hit.distance, r.height, snapPx);
      const st = useMeasureStore.getState();
      let f: WorldFeature | null;
      if (st.mode === 'points') {
        f = shift || !st.snap ? { objectId: o.id, type: 'point', p: hit.point.toArray() as [number, number, number], snap: 'surface' } : snapPoint(o, tri, hit.point, limit, true, st.snapCentres);
        if (f.snap === 'centre') lastCircle.current = null;
        // remember circles for centre snapping
        const c = !shift && st.snap && st.snapCentres ? pickFeature(o, tri, hit.point, { limit }) : null;
        if (c?.type === 'circle') lastCircle.current = c;
      } else {
        f = pickFeature(o, tri, hit.point, { limit, onlyPlane: alt, freePoint: shift, snapPoints: st.snap });
        if (f?.type === 'circle') lastCircle.current = f;
      }
      return { f, at: hit.point.clone() };
    };

    let frame = 0;
    let last: PointerEvent | null = null;
    let downAt: [number, number] | null = null;
    const update = () => {
      frame = 0;
      if (!last) return;
      const { f, at } = featureAt(last.clientX, last.clientY, last.shiftKey, last.altKey);
      hoverAt.current = at;
      const prev = useMeasureStore.getState().hover;
      if (JSON.stringify(prev) !== JSON.stringify(f)) useMeasureStore.getState().set({ hover: f });
    };
    const move = (e: PointerEvent) => {
      last = e;
      if (!frame) frame = requestAnimationFrame(update);
    };
    const down = (e: PointerEvent) => {
      if (e.button === 0) downAt = [e.clientX, e.clientY];
    };
    const up = (e: PointerEvent) => {
      if (e.button !== 0 || !downAt) return;
      const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
      downAt = null;
      if (moved > 4) return; // it was an orbit drag
      const { f } = featureAt(e.clientX, e.clientY, e.shiftKey, e.altKey);
      if (!f) return;
      const st = useMeasureStore.getState();
      st.set({ picks: st.picks.length >= 2 ? [f] : [...st.picks, f] });
    };
    const leave = () => useMeasureStore.getState().set({ hover: null });
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointerleave', leave);
    // clicks on objects must not change the selection while measuring
    viewportHandlers.click = () => true;
    measureViewport.project = (p) => {
      const r = el.getBoundingClientRect();
      const q = new Vector3(...p).project(getState().camera);
      return [r.left + ((q.x + 1) / 2) * r.width, r.top + ((1 - q.y) / 2) * r.height];
    };
    return () => {
      if (frame) cancelAnimationFrame(frame);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointerleave', leave);
      viewportHandlers.click = null;
      measureViewport.project = null;
      useMeasureStore.getState().set({ hover: null });
    };
  }, [active, gl, getState]);

  useEffect(() => {
    useMeasureStore.getState().set({ picks: [], hover: null });
    lastCircle.current = null;
  }, [mode]);

  const result = useMemo(() => (picks.length === 2 ? measure(picks[0]!, picks[1]!, fmt) : null), [picks, unit]); // eslint-disable-line

  useEffect(() => {
    invalidate();
    if (!active) return;
    const app = useAppStore.getState();
    if (result) app.setReady(result.rows.map(([k, v]) => `${k} ${v}`).join(' · '));
    else if (picks.length === 1) app.setReady(`${describe(picks[0]!, fmt).map(([k, v]) => `${k} ${v}`).join(' · ')} — click a second ${mode === 'points' ? 'point' : 'feature'}`);
    else app.setReady(mode === 'points' ? 'Measure: click a point (snaps to corners, midpoints, hole centres, edges; Shift = no snap)' : 'Measure: hover a face, edge, hole or corner and click (Shift = point, Alt = whole face)');
  }, [picks, hover, result, active, unit, mode, invalidate]); // eslint-disable-line

  const r = useMemo(() => {
    const objs = useSceneStore.getState().objects;
    if (!objs.length) return 0.5;
    const b = worldBox(objs[0]!);
    return Math.max(b.max.distanceTo(b.min) / 220, 0.12);
  }, [active]);

  const segment = useMemo(() => (result?.segment ? result.segment.map((p) => new Vector3(...p)) : null), [result]);
  const arc = useMemo(() => (result?.arc ? arcPoints(result.arc) : null), [result]);
  if (!active) return null;
  const hoverIsPicked = hover && picks.some((p) => JSON.stringify(p) === JSON.stringify(hover));
  const hoverPos = hover ? (hover.type === 'point' ? new Vector3(...hover.p) : hover.type === 'circle' ? new Vector3(...hover.center) : hoverAt.current) : null;
  return (
    <group>
      {hover && !hoverIsPicked && <FeatureHighlight f={hover} color={HOVER} r={r} opacity={0.9} />}
      {picks.map((f, i) => <FeatureHighlight key={i} f={f} color={COLORS[i]!} r={r} />)}
      {segment && <Polyline points={segment} color="#ffffff" />}
      {arc && arc.length > 1 && <Polyline points={arc} color="#5ad1a0" />}
      {hover && hoverPos && !hoverIsPicked && (
        <Html position={hoverPos} style={{ pointerEvents: 'none', transform: 'translate(12px, -28px)' }}>
          <Tag testId="measure-hover" tone="hover">{hoverLabel(hover, fmt)}</Tag>
        </Html>
      )}
      {result && segment && result.distance != null && (
        <Html position={segment[0]!.clone().add(segment[1]!).multiplyScalar(0.5)} center style={{ pointerEvents: 'none' }}>
          <Tag testId="measure-label">{fmt(result.distance)}</Tag>
        </Html>
      )}
      {result && result.angle != null && (arc?.length ? arc[Math.floor(arc.length / 2)] : segment ? null : hoverPos) && (
        <Html position={arc?.length ? arc[Math.floor(arc.length / 2)]! : hoverPos!} center style={{ pointerEvents: 'none' }}>
          <Tag testId="measure-angle" tone="angle">{result.angle.toFixed(2)}°</Tag>
        </Html>
      )}
      {result && !segment && result.angle != null && !arc?.length && picks[1] && (
        <Html position={picks[1].type === 'plane' ? picks[1].origin : picks[1].type === 'circle' ? picks[1].center : picks[1].type === 'edge' ? picks[1].a : picks[1].p} center style={{ pointerEvents: 'none' }}>
          <Tag testId="measure-label" tone="angle">{result.angle.toFixed(2)}°</Tag>
        </Html>
      )}
    </group>
  );
}

/** Sidebar panel: mode, snapping, picked features and all results (click a value to copy it). */
export function MeasurePanel() {
  const active = useAppStore((s) => s.activeTool === 'measure');
  const setActiveTool = useAppStore((s) => s.setActiveTool);
  const hasObjects = useSceneStore((s) => s.objects.length > 0);
  const unit = useSettingsStore((s) => s.units);
  const { mode, picks, hover, snap, snapCentres, set } = useMeasureStore();
  const snapPx = useSettingsStore((s) => s.measureSnapPx);
  const updateSettings = useSettingsStore((s) => s.update);
  const fmt = (mm: number) => formatLength(mm, unit);
  const result = picks.length === 2 ? measure(picks[0]!, picks[1]!, fmt) : null;
  const NAMES = { point: 'Point', edge: 'Edge', circle: 'Circle / hole', plane: 'Face' } as const;
  const nameOf = (f: WorldFeature) => (f.type === 'circle' && f.cylinder ? 'Cylinder / curved wall' : f.type === 'point' && f.snap ? `Point (${SNAPS[f.snap]})` : NAMES[f.type]);
  const SNAPS = { corner: 'corner', midpoint: 'edge midpoint', centre: 'centre', edge: 'on edge', surface: 'surface' } as const;
  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text).catch(() => {});
    useAppStore.getState().setReady(`Copied ${text}`);
  };
  const Rows = ({ rows }: { rows: Array<[string, string]> }) => (
    <>
      {rows.map(([k, v]) => (
        <button key={k} type="button" title="Copy" onClick={() => copy(v)} className="flex w-full justify-between gap-2 rounded px-0.5 text-left hover:bg-surface-3">
          <span className="text-muted">{k}</span>
          <span className="font-mono">{v}</span>
        </button>
      ))}
    </>
  );
  return (
    <div className="flex flex-col gap-1.5" data-testid="measure-panel">
      <FieldRow label="Mode">
        <Segmented label="Measure mode" value={mode} onChange={(m) => set({ mode: m })} options={[{ value: 'features', label: 'Features' }, { value: 'points', label: 'Points' }]} />
      </FieldRow>
      <FieldRow label="Snap to corners & midpoints" htmlFor="ms-snap" hint={mode === 'points' ? 'Also onto edges' : undefined}>
        <SwitchInput id="ms-snap" checked={snap} onChange={(v) => set({ snap: v })} />
      </FieldRow>
      <FieldRow label="Snap to hole centres" htmlFor="ms-snap-c">
        <SwitchInput id="ms-snap-c" checked={snapCentres} onChange={(v) => set({ snapCentres: v })} />
      </FieldRow>
      <FieldRow label="Snap radius" htmlFor="ms-snap-px" hint="Screen pixels around edges, corners and holes">
        <NumberInput id="ms-snap-px" value={snapPx} min={1} max={50} suffix="px" onCommit={(v) => updateSettings({ measureSnapPx: v })} />
      </FieldRow>
      <Button variant={active ? 'default' : 'primary'} disabled={!hasObjects} onClick={() => setActiveTool(active ? null : 'measure')}>
        {active ? 'Stop measuring (Esc)' : 'Start measuring (M)'}
      </Button>
      <p className="m-0 text-xs text-muted">
        {mode === 'features'
          ? 'Hover to preview, click to pick a face, edge, hole/circle or corner. Face ↔ face gives the distance (parallel) or the angle. Near a hole’s centre you get the centre point. Shift = point on the surface, Alt = whole face.'
          : 'Click two points. They snap to corners, edge midpoints, hole centres and edges; hold Shift for a free point.'}
      </p>
      {active && hover && (
        <div className="rounded-md border border-dashed border-line px-2 py-1 text-[12px] text-muted" data-testid="measure-hover-panel">
          Under cursor: <b className="text-ink">{nameOf(hover)}</b> · {hoverLabel(hover, fmt)}
        </div>
      )}
      {picks.map((f, i) => (
        <div key={i} className="rounded-md border border-line px-2 py-1 text-[12.5px]" data-testid={`measure-pick-${i}`}>
          <b style={{ color: COLORS[i] }}>{nameOf(f)}</b>
          <Rows rows={describe(f, fmt)} />
        </div>
      ))}
      {result && (
        <div className="rounded-md border border-accent px-2 py-1 text-[12.5px]" data-testid="measure-result">
          <Rows rows={result.rows} />
        </div>
      )}
      {picks.length > 0 && <ScaleToMeasure />}
      {picks.length > 0 && <Button variant="ghost" onClick={() => set({ picks: [] })}>Clear selection</Button>}
    </div>
  );
}
