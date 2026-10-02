import { useAppStore } from '../../store/useAppStore';
import { droppedToGrid, selectedObjects, useSceneStore } from '../../store/useSceneStore';
import { createObject } from '../../scene/create';
import { kernel, kernelMesh } from '../../geometry/kernel';
import type { KernelMesh } from '../../geometry/protocol';

export type BoolOp = 'union' | 'subtract' | 'intersect';
const LABEL: Record<BoolOp, string> = { union: 'Union', subtract: 'Subtract', intersect: 'Intersect' };

export async function runBoolean(op: BoolOp, keepTools: boolean) {
  const s = useSceneStore.getState();
  const sel = selectedObjects(s);
  if (sel.length < 2) return;
  const res = await useAppStore.getState().run(LABEL[op], () =>
    kernel<{ mesh: KernelMesh }>('boolean', { meshes: sel.map(kernelMesh), op, paletteSize: s.palette.length }),
  );
  if (!res) return;
  const name = op === 'union' ? sel.map((o) => o.name).join(' + ') : op === 'subtract' ? `${sel[0]!.name} − ${sel.length - 1}` : `${sel[0]!.name} ∩ ${sel.length - 1}`;
  const out = createObject(name.length > 48 ? name.slice(0, 47) + '…' : name, res.mesh.positions, res.mesh.faceColors, { kind: 'boolean' }, 'keep');
  const remove = keepTools && op === 'subtract' ? [sel[0]!.id] : sel.map((o) => o.id);
  s.replaceObjects(`${LABEL[op]} ${sel.length} objects`, remove, [out]);
  useAppStore.getState().setReady(`${LABEL[op]}: done`);
}

export async function runHollow(thickness: number, resolution: number, drain: number | null) {
  const s = useSceneStore.getState();
  const o = selectedObjects(s)[0];
  if (!o) return;
  const res = await useAppStore.getState().run('Hollow', () =>
    kernel<{ mesh: KernelMesh; volume: number; cavity: number; edge: number }>('hollow', {
      mesh: kernelMesh(o), thickness, resolution, drain: drain ? { diameter: drain } : null, paletteSize: s.palette.length,
    }),
  );
  if (!res) return;
  const out = createObject(o.name, res.mesh.positions, res.mesh.faceColors, { kind: 'tool' }, 'keep');
  s.replaceObjects(`Hollow ${o.name} (${thickness} mm walls)`, [o.id], [{ ...out, id: o.id }]);
  useAppStore.getState().setReady(`Hollowed: removed ${(res.cavity / 1000).toFixed(2)} cm³ (${res.edge.toFixed(2)} mm resolution)`);
}

export async function addPrimitive(kind: 'box' | 'cylinder' | 'sphere' | 'cone', size: [number, number, number], segments: number, color: number) {
  const res = await useAppStore.getState().run(`Create ${kind}`, () => kernel<{ mesh: KernelMesh }>('primitive', { kind, size, segments, color }));
  if (!res) return;
  const name = kind[0]!.toUpperCase() + kind.slice(1);
  const obj = droppedToGrid(createObject(name, res.mesh.positions, res.mesh.faceColors, { kind: 'primitive' }, 'beside'));
  useSceneStore.getState().addObjects(`Add ${name}`, [obj]);
  useAppStore.getState().setReady(`${name} added`);
}
