export type ModelFormat = 'stl' | 'obj' | 'gltf' | 'glb';

export const MODEL_EXTENSIONS: readonly ModelFormat[] = ['stl', 'obj', 'glb', 'gltf'];

/** Value for <input type="file" accept>. Sidecar files are allowed so .gltf can bring its .bin and textures. */
export const FILE_ACCEPT = '.stl,.obj,.mtl,.glb,.gltf,.bin';

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

export function formatOf(name: string): ModelFormat | null {
  const ext = extensionOf(name);
  return (MODEL_EXTENSIONS as readonly string[]).includes(ext) ? (ext as ModelFormat) : null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
