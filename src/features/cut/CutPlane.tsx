import { useEffect, useMemo, useRef, useState } from 'react';
import { TransformControls } from '@react-three/drei';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import { DoubleSide, Plane, Quaternion, Raycaster, Vector2, Vector3, type Material, type Mesh, type Ray } from 'three';
import { useAppStore } from '../../store/useAppStore';
import { selectedObjects, useSceneStore } from '../../store/useSceneStore';
import { worldBox } from '../../scene/geometry';
import { meshRegistry, viewportHandlers } from '../../viewport/SceneObjects';
import { SECTORS } from '../../ported/cut/connectors';
import { cutNormal, quatFor, useCutStore } from './cutStore';

/** Where a view ray meets the cut plane, or null when it runs parallel to it. */
function onPlane(ray: Ray, n: Vector3, offset: number): Vector3 | null {
  const plane = new Plane(n.clone(), -offset);
  return ray.intersectPlane(plane, new Vector3());
}

/** Preview of one connector at a point on the plane (plug: rises from the plane; dowel: centred on it). */
function ConnectorMarker({ at, n }: { at: Vector3; n: Vector3 }) {
  const c = useCutStore((s) => s.connectors);
  const q = useMemo(() => new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), n), [n]);
  const r = c.size / 2, segs = SECTORS[c.shape];
  const frustum = c.style === 'frustum';
  const parts: Array<{ y: number; h: number; top: number; bottom: number }> =
    c.type !== 'dowel'
      ? [{ y: c.depth / 2, h: c.depth, top: frustum ? 0 : r, bottom: r }]
      : frustum
        ? [{ y: c.depth / 2, h: c.depth, top: 0, bottom: r }, { y: -c.depth / 2, h: c.depth, top: r, bottom: 0 }]
        : [{ y: 0, h: c.depth * 2, top: r, bottom: r }];
  return (
    <group position={at} quaternion={q}>
      {parts.map((p, i) => (
        <mesh key={i} position={[0, p.y, 0]} rotation={[0, (c.rotation * Math.PI) / 180, 0]} renderOrder={6} raycast={() => {}}>
          <cylinderGeometry args={[p.top, p.bottom, p.h, segs]} />
          <meshBasicMaterial color="#5ad1a0" transparent opacity={0.85} depthTest={false} />
        </mesh>
      ))}
    </group>
  );
}

/** Translucent cut plane with its own gizmo (slides along its normal or rotates). */
export function CutPlane() {
  const active = useAppStore((s) => s.activeTool === 'cut');
  const target = useSceneStore((s) => selectedObjects(s)[0]);
  const { position, quaternion, gizmo, mode, connectors } = useCutStore();
  const invalidate = useThree((s) => s.invalidate);
  const gl = useThree((s) => s.gl);
  const [mesh, setMesh] = useState<Mesh | null>(null);
  const ref = useRef<Mesh>(null);
  const addRef = useRef<((ray: Ray) => void) | null>(null);
  const size = useMemo(() => {
    if (!target) return 100;
    const b = worldBox(target);
    return Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z) * 1.6 + 10;
  }, [target]);
  const n = useMemo(() => cutNormal({ quaternion }), [quaternion]);
  const offset = n.dot(new Vector3(...position));
  const placing = active && !!target && mode === 'plane' && connectors.type !== 'none' && connectors.placement === 'manual';
  useEffect(() => setMesh(ref.current), [active, target]);

  // Draw the cut: drag a line across the view; the plane contains that line and the view direction.
  const drawing = useCutStore((s) => s.drawing);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    if (!active && useCutStore.getState().drawing) useCutStore.getState().set({ drawing: false });
  }, [active]);
  useEffect(() => {
    if (!active || !drawing || !target) return;
    const el = gl.domElement;
    const host = el.parentElement ?? el;
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('data-testid', 'cut-line');
    svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:5';
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('stroke', '#ffd166');
    line.setAttribute('stroke-width', '2');
    line.setAttribute('stroke-dasharray', '6 4');
    svg.appendChild(line);
    host.appendChild(svg);
    el.style.cursor = 'crosshair';
    let start: [number, number] | null = null;
    const at = (e: PointerEvent): [number, number] => {
      const r = el.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      start = at(e);
      for (const k of ['x1', 'x2']) line.setAttribute(k, String(start[0]));
      for (const k of ['y1', 'y2']) line.setAttribute(k, String(start[1]));
    };
    const move = (e: PointerEvent) => {
      if (!start) return;
      e.stopImmediatePropagation();
      const p = at(e);
      line.setAttribute('x2', String(p[0]));
      line.setAttribute('y2', String(p[1]));
    };
    const up = (e: PointerEvent) => {
      if (!start) return;
      e.stopImmediatePropagation();
      const a = start, b = at(e);
      start = null;
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 6) return;
      const r = el.getBoundingClientRect();
      const ray = (p: [number, number]) => {
        const rc = new Raycaster();
        rc.setFromCamera(new Vector2((p[0] / r.width) * 2 - 1, -(p[1] / r.height) * 2 + 1), camera);
        return rc.ray;
      };
      const r1 = ray(a), r2 = ray(b);
      const p1 = r1.at(1, new Vector3()), p2 = r2.at(1, new Vector3()), q1 = r1.at(2, new Vector3());
      const nrm = p2.clone().sub(p1).cross(q1.sub(p1)).normalize();
      if (!(nrm.lengthSq() > 0.5)) return;
      const c = worldBox(target).getCenter(new Vector3());
      const pos = c.clone().addScaledVector(nrm, -(nrm.dot(c) - nrm.dot(p1)));
      useCutStore.getState().set({ position: pos.toArray() as [number, number, number], quaternion: quatFor(nrm), drawing: false });
    };
    el.addEventListener('pointerdown', down, { capture: true });
    el.addEventListener('pointermove', move, { capture: true });
    el.addEventListener('pointerup', up, { capture: true });
    return () => {
      el.removeEventListener('pointerdown', down, { capture: true });
      el.removeEventListener('pointermove', move, { capture: true });
      el.removeEventListener('pointerup', up, { capture: true });
      svg.remove();
      el.style.cursor = '';
    };
  }, [active, drawing, target, gl, camera]);
  useEffect(() => invalidate(), [position, quaternion, active, connectors, mode, invalidate]);

  // While placing connectors: clicks add a point on the plane, and everything above the plane is clipped away.
  useEffect(() => {
    if (!placing) return;
    const add = (ray: Ray) => {
      const p = onPlane(ray, n, offset);
      if (!p) return;
      const st = useCutStore.getState();
      st.setConnectors({ points: [...st.connectors.points, p.toArray() as [number, number, number]] });
    };
    viewportHandlers.click = (e) => {
      add(e.ray);
      return true;
    };
    addRef.current = add;
    const clip = new Plane(n.clone().negate(), offset + 1e-3);
    gl.localClippingEnabled = true;
    const touched: Material[] = [];
    for (const m of meshRegistry.values()) {
      const mat = m.material as Material;
      mat.clippingPlanes = [clip];
      mat.needsUpdate = true;
      touched.push(mat);
    }
    invalidate();
    return () => {
      viewportHandlers.click = null;
      addRef.current = null;
      for (const mat of touched) {
        mat.clippingPlanes = null;
        mat.needsUpdate = true;
      }
      invalidate();
    };
  }, [placing, n, offset, gl, invalidate]);

  if (!active || !target) return null;
  const onPlaneClick = (e: ThreeEvent<MouseEvent>) => {
    if (!placing || e.delta > 4) return;
    e.stopPropagation();
    addRef.current?.(e.ray);
  };
  return (
    <>
      <mesh ref={ref} position={position} quaternion={quaternion} renderOrder={5} raycast={placing ? undefined : () => {}} onClick={onPlaneClick}>
        <planeGeometry args={[size, size]} />
        <meshBasicMaterial color="#ffd166" transparent opacity={placing ? 0.12 : 0.28} side={DoubleSide} depthWrite={false} />
      </mesh>
      {placing &&
        connectors.points.map((p, i) => {
          const v = new Vector3(...p);
          v.addScaledVector(n, offset - n.dot(v));
          return <ConnectorMarker key={i} at={v} n={n} />;
        })}
      {mesh && (
        <TransformControls
          object={mesh}
          mode={gizmo}
          space="local"
          showX={gizmo === 'rotate'}
          showY={gizmo === 'rotate'}
          showZ
          size={0.9}
          onObjectChange={() => {
            useCutStore.getState().set({
              position: mesh.position.toArray() as [number, number, number],
              quaternion: mesh.quaternion.toArray() as [number, number, number, number],
            });
          }}
        />
      )}
    </>
  );
}
