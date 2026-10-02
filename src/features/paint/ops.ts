import { useAppStore } from '../../store/useAppStore';
import { selectedObjects, useSceneStore } from '../../store/useSceneStore';
import { worldPositions, writeColors } from '../../scene/geometry';
import { createObject } from '../../scene/create';
import { paletteIndexFor } from '../../scene/palette';
import type { SceneObject } from '../../scene/types';
import { kernel } from '../../geometry/kernel';
import type { KernelMesh } from '../../geometry/protocol';

/** Paints every triangle of the selected objects. */
export function paintWhole(color: number) {
  const s = useSceneStore.getState();
  const sel = new Set(s.selectedIds);
  if (!sel.size) return;
  s.apply('Paint whole object', { objects: s.objects.map((o) => (sel.has(o.id) ? { ...o, faceColors: new Uint16Array(o.faceColors.length).fill(color) } : o)) });
  // apply() only rewrites colours on palette changes; repaint these geometries.
  const st = useSceneStore.getState();
  st.objects.forEach((o) => sel.has(o.id) && writeColors(o.geometry, o.faceColors, st.palette));
  useSceneStore.setState((x) => ({ paintVersion: x.paintVersion + 1 }));
}

/** Paints every triangle whose centre lies between two world heights (Bambu's height-range painting, per triangle). */
export function paintHeightRange(color: number, zMin: number, zMax: number): number {
  const s = useSceneStore.getState();
  const sel = new Set(s.selectedIds.length ? s.selectedIds : s.objects.filter((o) => o.visible).map((o) => o.id));
  const lo = Math.min(zMin, zMax), hi = Math.max(zMin, zMax);
  let painted = 0;
  const objects = s.objects.map((o) => {
    if (!sel.has(o.id)) return o;
    const p = worldPositions(o);
    const fc = o.faceColors.slice();
    let n = 0;
    for (let t = 0; t < fc.length; t++) {
      const z = (p[t * 9 + 2]! + p[t * 9 + 5]! + p[t * 9 + 8]!) / 3;
      if (z >= lo && z <= hi && fc[t] !== color) { fc[t] = color; n++; }
    }
    painted += n;
    return n ? { ...o, faceColors: fc } : o;
  });
  if (!painted) return 0;
  s.apply(`Paint height ${lo}–${hi} mm`, { objects });
  const st = useSceneStore.getState();
  st.objects.forEach((o) => sel.has(o.id) && writeColors(o.geometry, o.faceColors, st.palette));
  useSceneStore.setState((x) => ({ paintVersion: x.paintVersion + 1 }));
  return painted;
}

/** One object per colour. Optionally closes the open cuts so each part is printable. */
export async function splitByColor(closeHoles: boolean) {
  const s = useSceneStore.getState();
  const o = selectedObjects(s)[0];
  if (!o) return;
  const colors = [...new Set(o.faceColors)].sort((a, b) => a - b);
  if (colors.length < 2) {
    useAppStore.getState().setNotice('This object has only one colour; nothing to split.');
    return;
  }
  const world = worldPositions(o);
  const parts = await useAppStore.getState().run('Split by colour', async () => {
    const out: SceneObject[] = [];
    for (const c of colors) {
      let n = 0;
      for (const fc of o.faceColors) if (fc === c) n++;
      let positions: Float32Array = new Float32Array(n * 9);
      let faceColors: Uint16Array = new Uint16Array(n).fill(c);
      let k = 0;
      for (let t = 0; t < o.faceColors.length; t++) {
        if (o.faceColors[t] !== c) continue;
        positions.set(world.subarray(t * 9, t * 9 + 9), k * 9);
        k++;
      }
      if (closeHoles) {
        const r = await kernel<{ mesh: KernelMesh }>('repair', { mesh: { positions, faceColors }, paletteSize: s.palette.length });
        positions = r.mesh.positions;
        faceColors = r.mesh.faceColors;
      }
      out.push(createObject(`${o.name} · ${s.palette[c]}`, positions, faceColors, { kind: 'split' }, 'keep'));
    }
    return out;
  });
  if (!parts) return;
  s.replaceObjects(`Split ${o.name} by colour`, [o.id], parts);
  useAppStore.getState().setReady(`Split into ${parts.length} parts`);
}

/** Adds a colour to the palette (undoable) and returns its index. */
export function addColor(hex: string): number {
  const s = useSceneStore.getState();
  const next = [...s.palette];
  const i = paletteIndexFor(next, hex);
  if (next.length !== s.palette.length) s.setPalette('Add colour', next);
  return i;
}

export function changeColor(index: number, hex: string) {
  const s = useSceneStore.getState();
  const next = [...s.palette];
  next[index] = hex;
  s.apply(`Change colour ${index + 1}`, { palette: next }, true);
  useSceneStore.setState((st) => ({ paintVersion: st.paintVersion + 1 }));
}

/** Splits the selected objects' triangles to at most `edge` mm so painted borders can be fine. Shape and colours stay. */
export async function refineForPainting(edge: number) {
  const s = useSceneStore.getState();
  const sel = selectedObjects(s);
  if (!sel.length) return;
  const res = await useAppStore.getState().run('Refine for painting', async () => {
    const out: SceneObject[] = [];
    for (const o of sel) {
      const r = await kernel<{ mesh: KernelMesh }>('refine', { mesh: { positions: worldPositions(o), faceColors: o.faceColors.slice() }, length: edge, paletteSize: s.palette.length, maxTriangles: 3_000_000 });
      const next = createObject(o.name, r.mesh.positions, r.mesh.faceColors, { ...o.source }, 'keep');
      out.push({ ...next, id: o.id, visible: o.visible, role: o.role });
    }
    return out;
  });
  if (!res) return;
  s.replaceObjects(`Refine ${sel.length === 1 ? sel[0]!.name : `${sel.length} objects`} for painting`, sel.map((o) => o.id), res);
  useAppStore.getState().setReady(`Refined: ${res.map((o) => o.faceColors.length.toLocaleString()).join(', ')} triangles`);
}
