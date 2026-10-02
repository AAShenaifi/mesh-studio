// PLY, AMF and VRML import through three.js loaders (vertex / material colours become palette colours).
import { Group, Mesh, MeshStandardMaterial, type Object3D } from 'three';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { AMFLoader } from 'three/examples/jsm/loaders/AMFLoader.js';
import { VRMLLoader } from 'three/examples/jsm/loaders/VRMLLoader.js';
import { useSceneStore } from '../../store/useSceneStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { createObject } from '../../scene/create';
import { flattenObject, yUpToZUp } from '../../scene/fromThree';
import type { SceneObject } from '../../scene/types';
import { LoadError } from '../../loaders/parsers';

function dispose(root: Object3D) {
  root.traverse((n) => {
    if (n instanceof Mesh) {
      n.geometry.dispose();
      (Array.isArray(n.material) ? n.material : [n.material]).forEach((m) => m.dispose());
    }
  });
}

async function toObject(file: File, root: Object3D, existing: SceneObject[], up: 'setting' | 'y' | 'z'): Promise<SceneObject[]> {
  try {
    const palette = [...useSceneStore.getState().palette];
    const { positions, faceColors } = flattenObject(root, palette, true);
    if (!faceColors.length) throw new LoadError(`${file.name} contains no triangles (point clouds are not supported).`);
    if (up === 'y' || (up === 'setting' && useSettingsStore.getState().upAxis === 'y')) yUpToZUp(positions);
    if (palette.length !== useSceneStore.getState().palette.length) useSceneStore.setState({ palette });
    const ext = file.name.split('.').pop()!.toLowerCase();
    return [createObject(file.name.replace(/\.[^.]+$/, ''), positions, faceColors, { kind: 'file', format: ext, fileName: file.name }, 'beside', existing)];
  } finally {
    dispose(root);
  }
}

export async function loadPly(file: File, existing: SceneObject[]): Promise<SceneObject[]> {
  let geometry;
  try {
    geometry = new PLYLoader().parse(await file.arrayBuffer());
  } catch (err) {
    throw new LoadError(`Could not read ${file.name} as PLY: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!geometry.getAttribute('position')?.count) throw new LoadError(`${file.name} has no vertices.`);
  const hasColor = !!geometry.getAttribute('color');
  const group = new Group().add(new Mesh(geometry, new MeshStandardMaterial({ vertexColors: hasColor })));
  return toObject(file, group, existing, 'setting');
}

export async function loadAmf(file: File, existing: SceneObject[]): Promise<SceneObject[]> {
  let root: Object3D;
  try {
    root = new AMFLoader().parse(await file.arrayBuffer());
  } catch (err) {
    throw new LoadError(`Could not read ${file.name} as AMF: ${err instanceof Error ? err.message : String(err)}`);
  }
  return toObject(file, root, existing, 'z');
}

export async function loadVrml(file: File, existing: SceneObject[]): Promise<SceneObject[]> {
  let root: Object3D;
  try {
    root = new VRMLLoader().parse(await file.text(), '');
  } catch (err) {
    throw new LoadError(`Could not read ${file.name} as VRML: ${err instanceof Error ? err.message : String(err)}`);
  }
  // VRML is Y-up like glTF
  return toObject(file, root, existing, 'y');
}
