import { useAppStore } from '../../store/useAppStore';
import { droppedToGrid, useSceneStore } from '../../store/useSceneStore';
import { createObject } from '../../scene/create';
import type { SceneObject } from '../../scene/types';
import { kernel } from '../../geometry/kernel';
import type { KernelMesh } from '../../geometry/protocol';
import type { Extrude2DArgs } from '../../geometry/kernelOps';
import { useExtrudeStore } from './extrudeStore';
import { svgToRegions } from './svg';

const baseName = (n: string) => n.replace(/\.[^.]+$/, '');

async function extrudeRegions(name: string, regions: Extrude2DArgs['regions'], srcWidth: number, existing: SceneObject[], flipY: boolean, minArea: number): Promise<SceneObject> {
  const s = useExtrudeStore.getState();
  const scale = s.width / Math.max(srcWidth, 1e-6);
  const res = await kernel<{ mesh: KernelMesh }>('extrude2d', { regions, depth: s.depth, scale, flipY, color: s.color, minArea } satisfies Extrude2DArgs);
  return droppedToGrid(createObject(name, res.mesh.positions, res.mesh.faceColors, { kind: 'extrude', fileName: name }, 'beside', existing));
}

export async function extrudeSvgFile(file: File, existing: SceneObject[]): Promise<SceneObject[]> {
  const { regions, width } = svgToRegions(await file.text());
  return [await extrudeRegions(baseName(file.name), regions, width, existing, true, 0)];
}

/** File-picker entry from the Create tab. */
export function pickAndExtrude(accept: string) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.addEventListener('change', async () => {
    const f = input.files?.[0];
    if (!f) return;
    const objs = await useAppStore.getState().run(`Extruding ${f.name}`, () => extrudeSvgFile(f, useSceneStore.getState().objects));
    if (objs?.length) {
      useSceneStore.getState().addObjects(`Extrude ${f.name}`, objs);
      useAppStore.getState().setReady(`Extruded ${f.name}`);
      useAppStore.getState().requestCamera('fit', 'selection');
    }
  });
  input.click();
}
