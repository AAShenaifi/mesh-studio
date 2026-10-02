// Wall-thickness check (3D Builder-style, reimplemented): from the middle of every
// triangle a ray goes straight inwards; the distance to the opposite wall is the
// local thickness. Thin areas are shown in red.
import { useEffect, useMemo, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { BufferGeometry, DoubleSide, Float32BufferAttribute, Ray, Vector3 } from 'three';
import type { MeshBVH } from 'three-mesh-bvh';
import { create } from 'zustand';
import { useSceneStore } from '../../store/useSceneStore';
import { useAppStore } from '../../store/useAppStore';
import { ensureBoundsTree, objectMatrix } from '../../scene/geometry';
import type { SceneObject } from '../../scene/types';
import { Button, FieldRow, NumberInput } from '../../ui/primitives';
import { originalTriangle } from '../paint/meshQuery';

export interface ThicknessResult {
  record: SceneObject;
  min: number;
  thin: number[];
  thinArea: number;
  checked: number;
}

export const useThicknessStore = create<{ result: ThicknessResult | null; limit: number; set: (p: Partial<{ result: ThicknessResult | null; limit: number }>) => void }>()((set) => ({
  result: null,
  limit: 0.8,
  set: (p) => set(p),
}));

/** Thickness per triangle (in world mm, assuming roughly uniform scale). */
export function checkThickness(o: SceneObject, limit: number): ThicknessResult {
  ensureBoundsTree(o.geometry);
  const bvh = (o.geometry as BufferGeometry & { boundsTree: MeshBVH }).boundsTree;
  const p = o.geometry.getAttribute('position').array as Float32Array;
  const tris = p.length / 9;
  const scale = (Math.abs(o.scale[0]) + Math.abs(o.scale[1]) + Math.abs(o.scale[2])) / 3 || 1;
  const ray = new Ray();
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), n = new Vector3();
  const thin: number[] = [];
  let min = Infinity, thinArea = 0;
  for (let t = 0; t < tris; t++) {
    a.set(p[t * 9]!, p[t * 9 + 1]!, p[t * 9 + 2]!);
    b.set(p[t * 9 + 3]!, p[t * 9 + 4]!, p[t * 9 + 5]!);
    c.set(p[t * 9 + 6]!, p[t * 9 + 7]!, p[t * 9 + 8]!);
    n.copy(b).sub(a).cross(c.clone().sub(a));
    const area2 = n.length();
    if (area2 < 1e-12) continue;
    n.divideScalar(area2);
    ray.origin.copy(a).add(b).add(c).divideScalar(3).addScaledVector(n, -1e-4);
    ray.direction.copy(n).negate();
    const hit = bvh.raycastFirst(ray, DoubleSide);
    if (!hit || originalTriangle(o.geometry, hit.faceIndex ?? -1) === t) continue;
    const d = hit.distance * scale;
    if (d < min) min = d;
    if (d < limit) {
      thin.push(t);
      thinArea += (area2 / 2) * scale * scale;
    }
  }
  return { record: o, min, thin, thinArea, checked: tris };
}

/** Analysis panel extra: run the check and summarise. */
export function ThicknessCheck({ object }: { object: SceneObject }) {
  const { result, limit, set } = useThicknessStore();
  const [running, setRunning] = useState(false);
  const current = result && result.record === object ? result : null;
  return (
    <div className="mt-2 border-t border-line pt-2" data-testid="thickness">
      <FieldRow label="Thinnest allowed wall" htmlFor="th-limit">
        <NumberInput id="th-limit" value={limit} min={0.05} max={20} suffix="mm" onCommit={(l) => set({ limit: l, result: null })} />
      </FieldRow>
      <Button
        className="w-full"
        disabled={running || object.faceColors.length > 2_000_000}
        onClick={() => {
          setRunning(true);
          // let the button repaint before the (synchronous) check
          window.setTimeout(() => {
            try {
              const r = checkThickness(object, limit);
              set({ result: r });
              useAppStore.getState().setReady(r.thin.length ? `${r.thin.length.toLocaleString()} triangles thinner than ${limit} mm (shown in red)` : `No walls thinner than ${limit} mm`);
            } finally {
              setRunning(false);
            }
          }, 20);
        }}
      >
        {running ? 'Checking…' : 'Check wall thickness'}
      </Button>
      {current && (
        <div className="mt-1 text-[12.5px]">
          <div className="flex justify-between"><span className="text-muted">Thinnest wall</span><span className="font-mono" data-testid="th-min">{Number.isFinite(current.min) ? `${current.min.toFixed(2)} mm` : '—'}</span></div>
          <div className="flex justify-between"><span className="text-muted">Thin area</span><span className={`font-mono ${current.thin.length ? 'text-warn' : 'text-ok'}`} data-testid="th-area">{(current.thinArea / 100).toFixed(2)} cm²</span></div>
          {current.thin.length > 0 && <Button variant="ghost" className="mt-1 w-full" onClick={() => set({ result: null })}>Hide thin areas</Button>}
        </div>
      )}
    </div>
  );
}

/** Red overlay over the thin triangles of the checked object. */
export function ThicknessOverlay() {
  const result = useThicknessStore((s) => s.result);
  const objects = useSceneStore((s) => s.objects);
  const invalidate = useThree((s) => s.invalidate);
  const live = result && objects.includes(result.record) && result.thin.length ? result : null;
  const geometry = useMemo(() => {
    if (!live) return null;
    const src = live.record.geometry.getAttribute('position').array as Float32Array;
    const m = objectMatrix(live.record);
    const out = new Float32Array(live.thin.length * 9);
    const v = new Vector3();
    live.thin.forEach((t, i) => {
      for (let k = 0; k < 3; k++) {
        v.set(src[t * 9 + k * 3]!, src[t * 9 + k * 3 + 1]!, src[t * 9 + k * 3 + 2]!).applyMatrix4(m);
        out[i * 9 + k * 3] = v.x; out[i * 9 + k * 3 + 1] = v.y; out[i * 9 + k * 3 + 2] = v.z;
      }
    });
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(out, 3));
    return g;
  }, [live]);
  useEffect(() => {
    invalidate();
    return () => geometry?.dispose();
  }, [geometry, invalidate]);
  if (!geometry) return null;
  return (
    <mesh geometry={geometry} renderOrder={3} raycast={() => {}}>
      <meshBasicMaterial color="#ff3b30" side={DoubleSide} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
    </mesh>
  );
}
