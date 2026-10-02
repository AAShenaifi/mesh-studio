import type { Object3D } from 'three';
import { useAppStore } from '../store/useAppStore';
import { useSceneStore } from '../store/useSceneStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { disposeObject } from './dispose';
import { formatBytes, formatOf, MODEL_EXTENSIONS, type ModelFormat } from './formats';
import { isSidecar, LoadError, parseGltf, parseObj, parseStl } from './parsers';
import { flattenObject, yUpToZUp } from '../scene/fromThree';
import { createObject } from '../scene/create';
import type { SceneObject } from '../scene/types';

/** Extra loaders registered by later phases (3MF, STEP, SVG, PNG). They return ready objects. */
export type ExtraLoader = (file: File, all: File[], existing: SceneObject[]) => Promise<SceneObject[]>;
const extraLoaders = new Map<string, ExtraLoader>();
export function registerLoader(ext: string, loader: ExtraLoader) {
  extraLoaders.set(ext, loader);
}
export const extraExtensions = () => [...extraLoaders.keys()];

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

function extOf(name: string) {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i + 1).toLowerCase();
}

/** Parses one mesh file into a world-space triangle soup (Z-up) and makes a scene object. */
async function loadMeshFile(file: File, format: ModelFormat, sidecars: File[], existing: SceneObject[]): Promise<SceneObject> {
  const buffer = await file.arrayBuffer();
  if (buffer.byteLength === 0) throw new LoadError(`${file.name} is empty (0 bytes).`);
  let content: Object3D;
  try {
    if (format === 'stl') content = parseStl(buffer);
    else if (format === 'obj') content = await parseObj(buffer, sidecars);
    else content = await parseGltf(buffer, sidecars);
  } catch (err) {
    if (err instanceof LoadError) throw err;
    const detail = err instanceof Error ? err.message : String(err);
    throw new LoadError(`Could not read ${file.name} as ${format.toUpperCase()}: ${detail}`);
  }
  try {
    const palette = [...useSceneStore.getState().palette];
    const { positions, faceColors } = flattenObject(content, palette, format === 'gltf' || format === 'glb' || format === 'obj');
    if (faceColors.length === 0) throw new LoadError(`${file.name} contains no triangles to display.`);
    // glTF is Y-up by spec; STL/OBJ follow the Up-axis setting.
    const yUp = format === 'gltf' || format === 'glb' || useSettingsStore.getState().upAxis === 'y';
    if (yUp) yUpToZUp(positions);
    if (palette.length !== useSceneStore.getState().palette.length) useSceneStore.setState({ palette });
    return createObject(file.name.replace(/\.[^.]+$/, ''), positions, faceColors, { kind: 'file', format, fileName: file.name }, 'beside', existing);
  } finally {
    disposeObject(content);
  }
}

let loadToken = 0;

const TEXTURE_EXT = new Set(['png', 'jpg', 'jpeg', 'webp']);
const isModelIn = (files: File[]) => {
  // Images dropped together with a .gltf are its textures, not things to extrude.
  const hasGltf = files.some((f) => extOf(f.name) === 'gltf');
  return (f: File) => (!!formatOf(f.name) || extraLoaders.has(extOf(f.name))) && !(hasGltf && TEXTURE_EXT.has(extOf(f.name)));
};

/** Loads every model file in `files` (sidecars are used, not loaded). Never throws. */
export async function loadFilesAsObjects(files: File[], existing: SceneObject[], onFile?: (f: File) => Promise<void> | void) {
  const objects: SceneObject[] = [];
  const errors: string[] = [];
  const sidecars = files.filter(isSidecar);
  for (const file of files.filter(isModelIn(files))) {
    await onFile?.(file);
    try {
      const format = formatOf(file.name);
      const all = [...existing, ...objects];
      if (format) objects.push(await loadMeshFile(file, format, sidecars, all));
      else objects.push(...(await extraLoaders.get(extOf(file.name))!(file, files, all)));
    } catch (err) {
      if (err instanceof LoadError) console.warn('[mesh-studio] load failed:', err.message);
      else console.warn('[mesh-studio] load failed:', err);
      errors.push(err instanceof LoadError || (err instanceof Error && err.name === 'Error') ? (err as Error).message : `Could not open ${file.name}: ${String(err)}`);
    }
  }
  return { objects, errors };
}

/**
 * Entry point for the file picker and drag-and-drop. Every model file becomes
 * its own object. Never throws: failures become a visible error, and files
 * that did load are kept.
 */
export async function openFiles(input: FileList | File[]): Promise<void> {
  const files = Array.from(input);
  const app = useAppStore.getState();
  const models = files.filter(isModelIn(files));
  if (!models.length) {
    const names = files.map((f) => f.name).join(', ');
    const exts = [...MODEL_EXTENSIONS, ...extraLoaders.keys()].map((e) => '.' + e).join(', ');
    app.setError(files.length ? `Unsupported file: ${names}. Mesh Studio opens ${exts}.` : 'No file was received. Try dropping the file again.');
    return;
  }
  const token = ++loadToken;
  const started = performance.now();
  const { objects: loaded, errors } = await loadFilesAsObjects(files, useSceneStore.getState().objects, async (f) => {
    app.setLoading(f.name);
    await nextFrame();
  });
  if (token !== loadToken) return;
  if (loaded.length) {
    const bytes = models.reduce((s, f) => s + f.size, 0);
    const ms = Math.round(performance.now() - started);
    useSceneStore.getState().addObjects(loaded.length === 1 ? `Open ${loaded[0]!.name}` : `Open ${loaded.length} objects`, loaded);
    app.setReady(`Loaded ${loaded.length === 1 ? models[0]!.name : loaded.length + ' objects'} (${formatBytes(bytes)}) in ${ms} ms`);
    if (useSettingsStore.getState().autoFitOnLoad) useAppStore.getState().requestCamera('iso');
  }
  if (errors.length) app.setError(errors.join(' '));
  else if (!loaded.length) app.setReady('Ready');
}

/** Adds objects produced by a tool and reports it in the status bar. */
export function addCreated(label: string, objects: SceneObject[], message?: string) {
  useSceneStore.getState().addObjects(label, objects);
  useAppStore.getState().setReady(message ?? label);
}
