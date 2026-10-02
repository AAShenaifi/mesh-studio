// Negative parts: cutters kept as their own objects (shown in translucent red),
// subtracted from every object they overlap when exporting or on "Apply".
import { useAppStore } from '../../store/useAppStore';
import { useSceneStore } from '../../store/useSceneStore';
import { createObject } from '../../scene/create';
import { worldBox } from '../../scene/geometry';
import type { SceneObject } from '../../scene/types';
import { kernel, kernelMesh } from '../../geometry/kernel';
import type { KernelMesh } from '../../geometry/protocol';

/** For each normal object overlapped by negative parts: its world mesh with them subtracted. */
export async function subtractNegatives(objects: SceneObject[], negatives: SceneObject[]): Promise<Map<string, KernelMesh>> {
  const out = new Map<string, KernelMesh>();
  const palette = useSceneStore.getState().palette;
  for (const o of objects) {
    if (o.role === 'negative') continue;
    const b = worldBox(o);
    const cutters = negatives.filter((n) => n.id !== o.id && worldBox(n).intersectsBox(b));
    if (!cutters.length) continue;
    try {
      const r = await kernel<{ mesh: KernelMesh }>('boolean', { meshes: [kernelMesh(o), ...cutters.map(kernelMesh)], op: 'subtract', paletteSize: palette.length });
      out.set(o.id, r.mesh);
    } catch (err) {
      // a negative that removes everything (or a non-watertight object) leaves the object as it is
      console.warn('[mesh-studio] negative part not applied to', o.name, err);
    }
  }
  return out;
}

/** Subtracts all visible negative parts from what they overlap, then removes them (one undo step). */
export async function applyNegatives() {
  const s = useSceneStore.getState();
  const negatives = s.objects.filter((o) => o.visible && o.role === 'negative');
  if (!negatives.length) return;
  const res = await useAppStore.getState().run('Apply negative parts', () => subtractNegatives(s.objects.filter((o) => o.visible), negatives));
  if (!res) return;
  const st = useSceneStore.getState();
  const objects = st.objects
    .filter((o) => !negatives.some((n) => n.id === o.id))
    .map((o) => {
      const m = res.get(o.id);
      if (!m) return o;
      const next = createObject(o.name, m.positions, m.faceColors, { kind: 'boolean' }, 'keep');
      return { ...next, id: o.id, visible: o.visible };
    });
  st.apply(`Apply ${negatives.length} negative part${negatives.length === 1 ? '' : 's'}`, { objects, selectedIds: [...res.keys()] });
  useAppStore.getState().setReady(`Cut ${negatives.length} negative part${negatives.length === 1 ? '' : 's'} out of ${res.size} object${res.size === 1 ? '' : 's'}`);
}
