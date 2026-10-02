import { useEffect, useRef, useState } from 'react';
import { TransformControls } from '@react-three/drei';
import { Box3, Vector3, type Mesh } from 'three';
import { useSceneStore } from '../store/useSceneStore';
import { useAppStore } from '../store/useAppStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { worldBox } from '../scene/geometry';
import { meshRegistry } from './SceneObjects';
import type { Vec3 } from '../scene/types';

const AXES = ['x', 'y', 'z'] as const;

/**
 * Object snapping while moving: on each axis being dragged, the moving box's
 * min / centre / max snaps to another object's min / centre / max (touching or
 * flush), and its bottom to the grid, when within `dist` mm.
 */
export function snapToObjects(box: Box3, others: Box3[], axes: string, dist: number): { delta: Vector3; hits: string[] } {
  const delta = new Vector3();
  const hits: string[] = [];
  for (const [i, a] of AXES.entries()) {
    if (!axes.toLowerCase().includes(a)) continue;
    const mine = [box.min[a], (box.min[a] + box.max[a]) / 2, box.max[a]];
    let best = Infinity, bestD = 0, what = '';
    const consider = (target: number, from: number, label: string) => {
      const d = target - from;
      if (Math.abs(d) < dist && Math.abs(d) < Math.abs(best)) { best = d; bestD = d; what = label; }
    };
    for (const o of others) {
      const theirs = [o.min[a], (o.min[a] + o.max[a]) / 2, o.max[a]];
      consider(theirs[0]!, mine[0]!, 'flush'); consider(theirs[2]!, mine[2]!, 'flush'); consider(theirs[1]!, mine[1]!, 'centre');
      consider(theirs[2]!, mine[0]!, 'touching'); consider(theirs[0]!, mine[2]!, 'touching');
    }
    if (a === 'z') consider(0, mine[0]!, 'grid');
    if (best !== Infinity) {
      delta.setComponent(i, bestD);
      hits.push(`${a.toUpperCase()} ${what}`);
    }
  }
  return { delta, hits };
}

/** Move/rotate/scale gizmo on the primary (last) selected object. Commits one undo step per drag. */
export function Gizmo() {
  const primary = useSceneStore((s) => s.selectedIds[s.selectedIds.length - 1]);
  const objects = useSceneStore((s) => s.objects);
  const mode = useSceneStore((s) => s.gizmoMode);
  const activeTool = useAppStore((s) => s.activeTool);
  const exploded = useAppStore((s) => s.explode > 0);
  const { snap, snapMove, snapRotate, snapScale, snapToObjects: objSnap, objectSnapDistance } = useSettingsStore();
  const [mesh, setMesh] = useState<Mesh | null>(null);
  const drag = useRef<{ start: Vector3; box: Box3; others: Box3[] } | null>(null);
  const controls = useRef<{ axis: string | null } | null>(null);

  useEffect(() => {
    // The mesh registers on mount; wait a frame for it.
    const id = requestAnimationFrame(() => setMesh(primary ? meshRegistry.get(primary) ?? null : null));
    return () => cancelAnimationFrame(id);
  }, [primary, objects]);

  const target = objects.find((o) => o.id === primary);
  // The mesh state can lag one frame behind the selection; never attach to a stale or detached mesh.
  if (!mesh || !target || !target.visible || activeTool || exploded || mesh.userData.objectId !== target.id || !mesh.parent) return null;

  const commit = () => {
    drag.current = null;
    const pos = mesh.position.toArray() as Vec3;
    const rot: Vec3 = [mesh.rotation.x, mesh.rotation.y, mesh.rotation.z];
    const scl = mesh.scale.toArray() as Vec3;
    const same = (a: Vec3, b: Vec3) => a.every((v, i) => Math.abs(v - b[i]!) < 1e-9);
    if (same(pos, target.position) && same(rot, target.rotation) && same(scl, target.scale)) return;
    const label = mode === 'translate' ? 'Move' : mode === 'rotate' ? 'Rotate' : 'Scale';
    useSceneStore.getState().updateObject(label, target.id, { position: pos, rotation: rot, scale: scl });
  };

  const onChange = () => {
    if (mode !== 'translate' || !objSnap) return;
    if (!drag.current) {
      const sel = new Set(useSceneStore.getState().selectedIds);
      drag.current = {
        start: new Vector3(...target.position),
        box: worldBox(target),
        others: objects.filter((o) => o.visible && !sel.has(o.id)).map((o) => worldBox(o)),
      };
    }
    const d = drag.current;
    const box = d.box.clone().translate(mesh.position.clone().sub(d.start));
    const { delta, hits } = snapToObjects(box, d.others, controls.current?.axis ?? 'xyz', objectSnapDistance);
    if (hits.length) {
      mesh.position.add(delta);
      useAppStore.getState().setReady(`Snapped: ${hits.join(', ')}`);
    }
  };

  return (
    <TransformControls
      ref={controls as never}
      object={mesh}
      mode={mode}
      size={0.85}
      translationSnap={snap ? snapMove : null}
      rotationSnap={snap ? (snapRotate * Math.PI) / 180 : null}
      scaleSnap={snap ? snapScale / 100 : null}
      onObjectChange={onChange}
      onMouseUp={commit}
    />
  );
}
