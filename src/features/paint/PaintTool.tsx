import { useEffect, useRef } from 'react';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import { DoubleSide, MOUSE, Quaternion, Vector3, type Mesh } from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { useAppStore } from '../../store/useAppStore';
import { useSceneStore } from '../../store/useSceneStore';
import type { SceneObject } from '../../scene/types';
import { viewportHandlers } from '../../viewport/SceneObjects';
import { floodFill, originalTriangle, trianglesInSphere, writeTriangleColors } from './meshQuery';
import { usePaintStore } from './paintStore';

interface Stroke {
  id: string;
  colors: Uint16Array;
  changed: boolean;
}

/** Applies the active brush/bucket at a hit on `o`; returns true if anything changed. */
function paintAt(o: SceneObject, mesh: Mesh, stroke: Stroke, worldPoint: Vector3, faceIndex: number | undefined): boolean {
  const { tool, color, radius, angle } = usePaintStore.getState();
  const hex = useSceneStore.getState().palette[color] ?? '#ffffff';
  let tris: number[];
  if (tool === 'bucket') {
    if (faceIndex === undefined) return false;
    tris = floodFill(o.geometry, stroke.colors, originalTriangle(o.geometry, faceIndex), angle);
  } else {
    const local = mesh.worldToLocal(worldPoint.clone());
    const s = mesh.scale;
    const scale = (Math.abs(s.x) + Math.abs(s.y) + Math.abs(s.z)) / 3 || 1;
    tris = trianglesInSphere(o.geometry, local, radius / scale);
  }
  const todo = tris.filter((t) => stroke.colors[t] !== color);
  if (!todo.length) return false;
  for (const t of todo) stroke.colors[t] = color;
  writeTriangleColors(o.geometry, todo, hex);
  return true;
}

/** Viewport side of the paint tool: strokes, bucket fills and the brush cursor. */
export function PaintTool() {
  const active = useAppStore((s) => s.activeTool === 'paint');
  const controls = useThree((s) => s.controls) as OrbitControls | null;
  const invalidate = useThree((s) => s.invalidate);
  const cursor = useRef<Mesh>(null);
  const radius = usePaintStore((s) => s.radius);
  const tool = usePaintStore((s) => s.tool);

  useEffect(() => {
    if (!active || !controls) return;
    // Left button paints; right button orbits, middle zooms.
    const prev = { ...controls.mouseButtons };
    controls.mouseButtons = { LEFT: -1 as MOUSE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE };
    return () => {
      controls.mouseButtons = prev;
    };
  }, [active, controls]);

  useEffect(() => {
    if (!active) return;
    let stroke: Stroke | null = null;
    const finish = () => {
      if (stroke?.changed) {
        useSceneStore.getState().updateObject(usePaintStore.getState().tool === 'bucket' ? 'Bucket fill' : 'Paint stroke', stroke.id, { faceColors: stroke.colors });
        useSceneStore.setState((s) => ({ paintVersion: s.paintVersion + 1 }));
      }
      stroke = null;
    };
    const showCursor = (e: ThreeEvent<PointerEvent>) => {
      const c = cursor.current;
      if (!c) return;
      c.visible = usePaintStore.getState().tool === 'brush';
      c.position.copy(e.point);
      const n = e.face?.normal.clone().transformDirection(e.object.matrixWorld) ?? new Vector3(0, 0, 1);
      c.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), n));
      c.position.addScaledVector(n, 0.05);
      invalidate();
    };
    viewportHandlers.pointer = (e, o, kind) => {
      const mesh = e.object as Mesh;
      if (kind === 'move') showCursor(e);
      if (kind === 'down' && e.button === 0) {
        stroke = { id: o.id, colors: o.faceColors.slice(), changed: false };
        stroke.changed = paintAt(o, mesh, stroke, e.point, e.faceIndex ?? undefined);
        if (usePaintStore.getState().tool === 'bucket') finish();
        invalidate();
        return true;
      }
      if (kind === 'move' && stroke && stroke.id === o.id && (e.buttons & 1)) {
        if (paintAt(o, mesh, stroke, e.point, e.faceIndex ?? undefined)) stroke.changed = true;
        invalidate();
        return true;
      }
      if (kind === 'up') {
        finish();
        return true;
      }
      return false;
    };
    viewportHandlers.click = () => true; // painting never changes the selection
    window.addEventListener('pointerup', finish);
    return () => {
      finish();
      viewportHandlers.pointer = null;
      viewportHandlers.click = null;
      window.removeEventListener('pointerup', finish);
    };
  }, [active, invalidate]);

  if (!active) return null;
  return (
    <mesh ref={cursor} visible={false} renderOrder={6} raycast={() => {}}>
      <ringGeometry args={[Math.max(radius - Math.max(radius * 0.08, 0.15), 0), radius, 48]} />
      <meshBasicMaterial color={tool === 'brush' ? '#ffd166' : '#ffffff'} side={DoubleSide} transparent opacity={0.9} depthTest={false} />
    </mesh>
  );
}
