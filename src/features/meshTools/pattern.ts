// Linear / grid / circular patterns (arrays) of the selected objects.
import { Matrix4, Vector3 } from 'three';
import { create } from 'zustand';
import { newId, selectedObjects, useSceneStore, withWorldTransform } from '../../store/useSceneStore';
import { useAppStore } from '../../store/useAppStore';
import { boxOf, worldPositions } from '../../scene/geometry';
import { createObject } from '../../scene/create';
import type { SceneObject, Vec3 } from '../../scene/types';

export interface PatternSettings {
  kind: 'linear' | 'circular';
  /** Linear: copies along direction 1 (total count incl. the original) and optional direction 2 (grid). */
  count: number;
  spacing: number;
  axis: 'x' | 'y' | 'z';
  /** Spacing measured between object centres or as the gap between objects. */
  spacingMode: 'pitch' | 'gap';
  count2: number;
  spacing2: number;
  axis2: 'x' | 'y' | 'z';
  /** Circular: total count, total angle, axis, radius from the axis to the object centre. */
  ccount: number;
  angle: number;
  caxis: 'x' | 'y' | 'z';
  radius: number;
  /** Turn each copy with the pattern (like a wheel) or keep its orientation. */
  rotateCopies: boolean;
  /** One object instead of separate copies. */
  merge: boolean;
  /** Copies share one mesh with the original (painting one paints all). */
  linked: boolean;
  set: (p: Partial<Omit<PatternSettings, 'set'>>) => void;
}

export const usePatternStore = create<PatternSettings>()((set) => ({
  kind: 'linear',
  count: 3,
  spacing: 5,
  axis: 'x',
  spacingMode: 'gap',
  count2: 1,
  spacing2: 5,
  axis2: 'y',
  ccount: 6,
  angle: 360,
  caxis: 'z',
  radius: 30,
  rotateCopies: true,
  merge: false,
  linked: false,
  set: (p) => set(p),
}));

const UNIT: Record<'x' | 'y' | 'z', Vector3> = { x: new Vector3(1, 0, 0), y: new Vector3(0, 1, 0), z: new Vector3(0, 0, 1) };

function copyWith(o: SceneObject, m: Matrix4, name: string, linkId?: string): SceneObject {
  return {
    ...o,
    ...withWorldTransform(o, m),
    id: newId(),
    name,
    geometry: linkId ? o.geometry : o.geometry.clone(),
    faceColors: linkId ? o.faceColors : o.faceColors.slice(),
    linkId,
    source: { ...o.source, kind: o.source.kind === 'generator' ? o.source.kind : 'duplicate' },
  };
}

/** World transforms of every copy (excluding the original). */
export function patternMatrices(sel: SceneObject[], p: Omit<PatternSettings, 'set'>): Matrix4[] {
  const box = boxOf(sel);
  const size = box.getSize(new Vector3());
  const centre = box.getCenter(new Vector3());
  const out: Matrix4[] = [];
  if (p.kind === 'linear') {
    const step = (axis: 'x' | 'y' | 'z', spacing: number) => UNIT[axis].clone().multiplyScalar(p.spacingMode === 'gap' ? size[axis] + spacing : spacing);
    const s1 = step(p.axis, p.spacing), s2 = step(p.axis2, p.spacing2);
    for (let j = 0; j < Math.max(1, p.count2); j++) for (let i = 0; i < Math.max(1, p.count); i++) {
      if (!i && !j) continue;
      const t = s1.clone().multiplyScalar(i).addScaledVector(s2, j);
      out.push(new Matrix4().makeTranslation(t.x, t.y, t.z));
    }
  } else {
    const ax = UNIT[p.caxis];
    // the rotation axis runs `radius` away from the selection centre, on the side of -X (or -Y for an X axis)
    const side = p.caxis === 'x' ? new Vector3(0, -1, 0) : new Vector3(-1, 0, 0);
    const pivot = centre.clone().addScaledVector(side, p.radius);
    const n = Math.max(2, p.ccount);
    const full = Math.abs(Math.abs(p.angle) - 360) < 1e-9;
    const stepDeg = full ? p.angle / n : p.angle / (n - 1);
    for (let i = 1; i < n; i++) {
      const a = (stepDeg * i * Math.PI) / 180;
      const toPivot = new Matrix4().makeTranslation(pivot.x, pivot.y, pivot.z);
      const back = new Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z);
      if (p.rotateCopies) out.push(toPivot.multiply(new Matrix4().makeRotationAxis(ax, a)).multiply(back));
      else {
        const moved = centre.clone().sub(pivot).applyAxisAngle(ax, a).add(pivot).sub(centre);
        out.push(new Matrix4().makeTranslation(moved.x, moved.y, moved.z));
      }
    }
  }
  return out;
}

export function applyPattern() {
  const s = useSceneStore.getState();
  const sel = selectedObjects(s);
  if (!sel.length) return 0;
  const p = usePatternStore.getState();
  const mats = patternMatrices(sel, p);
  if (!mats.length) return 0;
  const copies: SceneObject[] = [];
  const links = new Map(sel.map((o) => [o.id, p.linked && !p.merge ? o.linkId ?? newId() : undefined]));
  mats.forEach((m, k) => sel.forEach((o) => copies.push(copyWith(o, m, `${o.name} ${k + 2}`, links.get(o.id)))));
  const label = `${p.kind === 'linear' ? 'Linear' : 'Circular'} pattern ×${mats.length + 1}`;
  if (p.merge) {
    const parts = [...sel, ...copies];
    let n = 0;
    for (const o of parts) n += o.faceColors.length;
    const positions = new Float32Array(n * 9), faceColors = new Uint16Array(n);
    let k = 0;
    for (const o of parts) {
      positions.set(worldPositions(o), k * 9);
      faceColors.set(o.faceColors, k);
      k += o.faceColors.length;
    }
    copies.forEach((c) => c.geometry.dispose());
    const merged = createObject(`${sel[0]!.name} pattern`, positions, faceColors, { kind: 'tool' }, 'keep');
    s.replaceObjects(label, sel.map((o) => o.id), [merged]);
  } else {
    const originals = s.objects.map((o) => (links.get(o.id) ? { ...o, linkId: links.get(o.id) } : o));
    s.apply(label, { objects: [...originals, ...copies], selectedIds: [...sel.map((o) => o.id), ...copies.map((c) => c.id)] });
  }
  useAppStore.getState().setReady(`${label}: ${copies.length} cop${copies.length === 1 ? 'y' : 'ies'} added`);
  useAppStore.getState().requestCamera('fit', 'selection');
  return copies.length;
}

/** Positions of the copies' centres, for the viewport preview. */
export function previewCentres(sel: SceneObject[], p: Omit<PatternSettings, 'set'>): Vec3[] {
  const c = boxOf(sel).getCenter(new Vector3());
  return patternMatrices(sel, p).map((m) => c.clone().applyMatrix4(m).toArray() as Vec3);
}
