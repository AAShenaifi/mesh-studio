import { Matrix4, Quaternion, Vector3 } from 'three';
import { useAppStore } from '../../store/useAppStore';
import { droppedToGrid, selectedObjects, useSceneStore, withWorldTransform } from '../../store/useSceneStore';
import { createObject } from '../../scene/create';
import { worldBox, worldPositions } from '../../scene/geometry';
import type { SceneObject } from '../../scene/types';
import { kernel, kernelMesh } from '../../geometry/kernel';
import type { KernelMesh } from '../../geometry/protocol';
import { minimizeFootprint } from '../prep/orient';

/** Replaces `o` with a new mesh at the same id (same name/source), as one undo step. */
function replaceMesh(o: SceneObject, mesh: KernelMesh, label: string, source = o.source) {
  const next = createObject(o.name, mesh.positions, mesh.faceColors, { ...source }, 'keep');
  useSceneStore.getState().replaceObjects(label, [o.id], [{ ...next, id: o.id, visible: o.visible }]);
}

const app = () => useAppStore.getState();
const one = () => selectedObjects(useSceneStore.getState())[0];

export async function simplifySelected(ratio: number) {
  const o = one();
  if (!o) return;
  const res = await app().run('Simplify', () => kernel<{ mesh: KernelMesh; before: number; after: number }>('simplify', { mesh: kernelMesh(o), ratio }));
  if (!res) return;
  replaceMesh(o, res.mesh, `Simplify ${o.name}`, { ...o.source, kind: o.source.kind === 'generator' ? 'tool' : o.source.kind, scad: undefined });
  app().setReady(`Simplified ${res.before.toLocaleString()} → ${res.after.toLocaleString()} triangles`);
}

export async function smoothSelected(subdivisions: number, sharpAngle: number) {
  const o = one();
  if (!o) return;
  const s = useSceneStore.getState();
  const res = await app().run('Smooth', () => kernel<{ mesh: KernelMesh }>('smooth', { mesh: kernelMesh(o), subdivisions, sharpAngle, paletteSize: s.palette.length }));
  if (!res) return;
  replaceMesh(o, res.mesh, `Smooth ${o.name}`, { kind: 'tool' });
  app().setReady(`Smoothed: ${res.mesh.faceColors.length.toLocaleString()} triangles`);
}

export async function extrudeDownSelected() {
  const o = one();
  if (!o) return;
  const s = useSceneStore.getState();
  const res = await app().run('Extrude down', () => kernel<{ mesh: KernelMesh; added: number }>('extrudeDown', { mesh: kernelMesh(o), paletteSize: s.palette.length }));
  if (!res) return;
  replaceMesh(o, res.mesh, `Extrude down ${o.name}`, { kind: 'tool' });
  app().setReady(`Extruded down: added ${(res.added / 1000).toFixed(2)} cm³`);
}

export async function brimEarsSelected(diameter: number, height: number, maxAngle: number) {
  const o = one();
  if (!o) return;
  const s = useSceneStore.getState();
  const res = await app().run('Brim ears', () =>
    kernel<{ mesh: KernelMesh; ears: number }>('brimEars', { mesh: kernelMesh(o), diameter, height, maxAngle, color: null, paletteSize: s.palette.length }),
  );
  if (!res) return;
  replaceMesh(o, res.mesh, `Brim ears on ${o.name}`, { kind: 'tool' });
  app().setReady(`Added ${res.ears} brim ear${res.ears === 1 ? '' : 's'}`);
}

/** One object per connected piece (cavities stay with the piece around them). */
export async function splitIntoParts() {
  const o = one();
  if (!o) return;
  const res = await app().run('Split into parts', () => kernel<{ parts: KernelMesh[] }>('splitParts', { mesh: kernelMesh(o) }));
  if (!res) return;
  if (res.parts.length < 2) {
    app().setNotice(`${o.name} is a single piece; nothing to split.`);
    return;
  }
  const made = res.parts.map((p, i) => createObject(`${o.name} part ${i + 1}`, p.positions, p.faceColors, { kind: 'split' }, 'keep'));
  useSceneStore.getState().replaceObjects(`Split ${o.name} into parts`, [o.id], made);
  app().setReady(`Split into ${made.length} parts`);
}

/** Joins the selected objects into one object without a boolean (meshes are just combined). */
export function mergeSelected() {
  const s = useSceneStore.getState();
  const sel = selectedObjects(s);
  if (sel.length < 2) return;
  let n = 0;
  for (const o of sel) n += o.faceColors.length;
  const positions = new Float32Array(n * 9), faceColors = new Uint16Array(n);
  let k = 0;
  for (const o of sel) {
    positions.set(worldPositions(o), k * 9);
    faceColors.set(o.faceColors, k);
    k += o.faceColors.length;
  }
  const merged = createObject(sel[0]!.name + (sel.length > 1 ? ` + ${sel.length - 1}` : ''), positions, faceColors, { kind: 'tool' }, 'keep');
  s.replaceObjects(`Merge ${sel.length} objects`, sel.map((o) => o.id), [merged]);
  app().setReady(`Merged ${sel.length} objects into one (no boolean)`);
}

export async function fixNormalsSelected() {
  const o = one();
  if (!o) return null;
  const res = await app().run('Fix normals', () => kernel<{ mesh: KernelMesh; flipped: number; pieces: number }>('fixNormals', { mesh: kernelMesh(o) }));
  if (!res) return null;
  if (res.flipped) replaceMesh(o, res.mesh, `Fix normals of ${o.name}`, { ...o.source });
  app().setReady(res.flipped ? `Flipped ${res.flipped.toLocaleString()} triangle${res.flipped === 1 ? '' : 's'} in ${res.pieces} piece${res.pieces === 1 ? '' : 's'}` : 'All normals already point outwards');
  return res.flipped;
}

export async function mergeShellsSelected() {
  const o = one();
  if (!o) return;
  const s = useSceneStore.getState();
  const res = await app().run('Remove self-intersections', () =>
    kernel<{ mesh: KernelMesh; before: number; after: number }>('mergeShells', { mesh: kernelMesh(o), paletteSize: s.palette.length }),
  );
  if (!res) return;
  replaceMesh(o, res.mesh, `Merge shells of ${o.name}`, { kind: 'repair' });
  app().setReady(`United ${res.before} shell${res.before === 1 ? '' : 's'} into ${res.after} solid piece${res.after === 1 ? '' : 's'}`);
}

/** Rotates `o` about its bbox centre so world vector `up` points to +Z, then drops it to the grid. */
export function orientUp(o: SceneObject, up: Vector3): SceneObject {
  const q = new Quaternion().setFromUnitVectors(up.clone().normalize(), new Vector3(0, 0, 1));
  const c = worldBox(o).getCenter(new Vector3());
  const m = new Matrix4().makeTranslation(c.x, c.y, c.z).multiply(new Matrix4().makeRotationFromQuaternion(q)).multiply(new Matrix4().makeTranslation(-c.x, -c.y, -c.z));
  return droppedToGrid({ ...o, ...withWorldTransform(o, m) });
}

/** Bambu Studio's auto-orient (fewest overhangs, stable base) for every selected object. */
export async function autoOrientForPrinting() {
  const s = useSceneStore.getState();
  const sel = selectedObjects(s);
  if (!sel.length) return;
  const angle = app().overhang.angle;
  const results = await app().run('Auto orient', async () => {
    const out: Array<{ id: string; up: [number, number, number]; overhang: number; currentOverhang: number | null }> = [];
    for (const o of sel) out.push({ id: o.id, ...(await kernel<{ up: [number, number, number]; overhang: number; currentOverhang: number | null }>('orient', { mesh: kernelMesh(o), overhangAngle: angle })) });
    return out;
  });
  if (!results) return;
  const by = new Map(results.map((r) => [r.id, r]));
  const st = useSceneStore.getState();
  st.apply('Auto orient for printing', { objects: st.objects.map((o) => (by.has(o.id) ? minimizeFootprint(orientUp(o, new Vector3(...by.get(o.id)!.up))) : o)) });
  const r = results[0]!;
  app().setReady(
    results.length === 1
      ? `Oriented: overhang area ${(r.overhang / 100).toFixed(1)} cm²${r.currentOverhang != null ? ` (was ${(r.currentOverhang / 100).toFixed(1)} cm²)` : ''}`
      : `Oriented ${results.length} objects`,
  );
}

/** Rebuild as one clean solid (fixes self-intersections, overlaps and small gaps; loses detail below the resolution). */
export async function remeshSelected(resolution: number) {
  const o = one();
  if (!o) return;
  const s = useSceneStore.getState();
  const res = await app().run('Rebuild as solid', () => kernel<{ mesh: KernelMesh; edge: number }>('remesh', { mesh: kernelMesh(o), resolution, paletteSize: s.palette.length }));
  if (!res) return;
  replaceMesh(o, res.mesh, `Rebuild ${o.name} as solid`, { kind: 'repair' });
  app().setReady(`Rebuilt as one watertight solid at ${res.edge.toFixed(2)} mm resolution (${res.mesh.faceColors.length.toLocaleString()} triangles)`);
}
