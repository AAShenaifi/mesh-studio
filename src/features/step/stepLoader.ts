import { Box3, Vector3 } from 'three';
import { useAppStore } from '../../store/useAppStore';
import { useSceneStore } from '../../store/useSceneStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { createObject } from '../../scene/create';
import { boxOf } from '../../scene/geometry';
import { paletteIndexFor } from '../../scene/palette';
import type { SceneObject } from '../../scene/types';
import type { StepPart } from './step.worker';

export const STEP_QUALITY = {
  draft: { linear: 0.003, angular: 0.6, label: 'Draft (fast, coarse)' },
  normal: { linear: 0.001, angular: 0.35, label: 'Normal' },
  fine: { linear: 0.0002, angular: 0.12, label: 'Fine (slow, smooth)' },
} as const;
export type StepQuality = keyof typeof STEP_QUALITY;

let worker: Worker | null = null;
let seq = 0;

function readCad(format: 'step' | 'iges' | 'brep', data: ArrayBuffer, quality: StepQuality): Promise<StepPart[]> {
  worker ??= new Worker(new URL('./step.worker.ts', import.meta.url), { type: 'module', name: 'opencascade' });
  const w = worker;
  const id = ++seq;
  const q = STEP_QUALITY[quality];
  return new Promise((resolve, reject) => {
    const onMsg = (e: MessageEvent<{ id: number; ok: boolean; parts?: StepPart[]; error?: string }>) => {
      if (e.data.id !== id) return;
      w.removeEventListener('message', onMsg);
      if (e.data.ok) resolve(e.data.parts!);
      else reject(new Error(e.data.error));
    };
    w.addEventListener('message', onMsg);
    w.onerror = (ev) => {
      reject(new Error(`The CAD import worker failed: ${ev.message || 'unknown error'}`));
      worker?.terminate();
      worker = null;
    };
    w.postMessage({ id, format, data, linear: q.linear, angular: q.angular }, [data]);
  });
}

/**
 * STEP/IGES/BREP → scene objects. Assembly parts keep their relative
 * placement; the whole group is set beside existing objects, on the grid.
 */
export async function loadCad(file: File, existing: SceneObject[]): Promise<SceneObject[]> {
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  const format = ext === 'igs' || ext === 'iges' ? 'iges' : ext === 'brep' ? 'brep' : 'step';
  const { stepQuality, stepPerPart } = useSettingsStore.getState();
  useAppStore.getState().setLoading(`${file.name} with OpenCascade (${STEP_QUALITY[stepQuality].label.split(' ')[0]})`);
  const parts = await readCad(format, await file.arrayBuffer(), stepQuality);
  const nonEmpty = parts.filter((p) => p.positions.length);
  if (!nonEmpty.length) throw new Error(`${file.name} contains no solid geometry.`);
  const palette = [...useSceneStore.getState().palette];
  const toObj = (name: string, list: StepPart[]) => {
    const tris = list.reduce((s, p) => s + p.positions.length / 9, 0);
    const positions = new Float32Array(tris * 9);
    const faceColors = new Uint16Array(tris);
    let o = 0;
    for (const p of list) {
      positions.set(p.positions, o * 9);
      p.colors.forEach((c, i) => (faceColors[o + i] = c && c !== '#ffffff' ? paletteIndexFor(palette, c) : 0));
      o += p.positions.length / 9;
    }
    return createObject(name, positions, faceColors, { kind: 'file', format: ext, fileName: file.name }, 'keep');
  };
  const base = file.name.replace(/\.[^.]+$/, '');
  let objects = stepPerPart && nonEmpty.length > 1 ? nonEmpty.map((p) => toObj(p.name || base, [p])) : [toObj(base, nonEmpty)];
  // move the group as one: beside the scene, resting on the grid
  const group = boxOf(objects);
  const size = group.getSize(new Vector3());
  let target = new Vector3(0, 0, 0);
  if (existing.length) {
    const scene: Box3 = boxOf(existing);
    target = new Vector3(scene.max.x + 8 + size.x / 2, (scene.min.y + scene.max.y) / 2, 0);
  }
  const shift = new Vector3(target.x - (group.min.x + group.max.x) / 2, target.y - (group.min.y + group.max.y) / 2, -group.min.z);
  objects = objects.map((o) => ({ ...o, position: [o.position[0] + shift.x, o.position[1] + shift.y, o.position[2] + shift.z] }));
  if (palette.length !== useSceneStore.getState().palette.length) useSceneStore.setState({ palette });
  return objects;
}
