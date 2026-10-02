import { useAppStore } from '../../store/useAppStore';
import { droppedToGrid, useSceneStore } from '../../store/useSceneStore';
import { createObject } from '../../scene/create';
import { paletteIndexFor } from '../../scene/palette';
import type { SceneObject } from '../../scene/types';
import { decode, loadRaster, processImage } from './client';
import { FULL_MAX, type ImageSettings, type ProcessResult } from './types';

/** Local colour indices (0 = base colour, 1.. = quantised image colours) → global palette indices. */
export function toFaceColors(res: ProcessResult, base: number): Uint16Array {
  const palette = [...useSceneStore.getState().palette];
  const map = [base, ...res.colors.map((c) => paletteIndexFor(palette, c))];
  // Palette growth is not an undo step of its own (same as file loaders).
  if (palette.length !== useSceneStore.getState().palette.length) useSceneStore.setState({ palette });
  const out = new Uint16Array(res.triColor.length);
  for (let i = 0; i < out.length; i++) out[i] = map[res.triColor[i]!] ?? base;
  return out;
}

/** Full-resolution import (or re-tune of `editId`). Returns the created object. */
export async function importImage(blob: Blob, name: string, s: ImageSettings, editId: string | null): Promise<SceneObject | undefined> {
  return useAppStore.getState().run(`Importing ${name}`, async () => {
    await loadRaster('full', await decode(blob, FULL_MAX));
    const res = await processImage('full', s);
    if (!res.positions.length) throw new Error('Nothing is selected in this image. Move the Levels slider or turn on Invert.');
    const faceColors = toFaceColors(res, s.color);
    const scene = useSceneStore.getState();
    const base = name.replace(/\.[^.]+$/, '');
    const source = { kind: 'extrude' as const, fileName: name, image: { blob, name, settings: { ...s } } };
    let obj = droppedToGrid(createObject(base, res.positions, faceColors, source, 'beside'));
    const old = editId ? scene.objects.find((o) => o.id === editId) : undefined;
    if (old) {
      obj = droppedToGrid({ ...obj, id: old.id, name: old.name, position: [old.position[0], old.position[1], 0], rotation: old.rotation, visible: old.visible });
      scene.replaceObjects(`Re-tune ${old.name}`, [old.id], [obj]);
    } else scene.addObjects(`Import image ${name}`, [obj]);
    useAppStore.getState().setReady(`Imported ${name}`);
    useAppStore.getState().requestCamera('fit', 'selection');
    return obj;
  });
}
