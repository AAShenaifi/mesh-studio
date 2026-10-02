import { Group, LoadingManager, Mesh, type Color, type Material, type Object3D } from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createModelMaterial } from './materials';
import { extensionOf } from './formats';

/** An error whose message is already written for the user. */
export class LoadError extends Error {
  override name = 'LoadError';
}

export function parseStl(buffer: ArrayBuffer): Object3D {
  const geometry = new STLLoader().parse(buffer);
  // Stored STL normals are often zero or inconsistent; derive them from the
  // triangle winding instead (non-indexed, so this gives flat shading).
  geometry.deleteAttribute('normal');
  geometry.computeVertexNormals();
  const hasColors = Boolean((geometry as { hasColors?: boolean }).hasColors);
  const mesh = new Mesh(geometry, createModelMaterial(hasColors));
  const group = new Group();
  group.add(mesh);
  return group;
}

/**
 * OBJ with optional .mtl (from the same drop/pick). Material colours become
 * palette colours; names like `mat_rrggbb` (Mesh Studio exports) also carry
 * the colour when the .mtl is missing.
 */
export async function parseObj(buffer: ArrayBuffer, sidecars: File[] = []): Promise<Object3D> {
  const text = new TextDecoder().decode(buffer);
  const loader = new OBJLoader();
  const mtlName = /^mtllib\s+(.+)$/m.exec(text)?.[1]?.trim().toLowerCase();
  const mtlFile = sidecars.find((f) => f.name.toLowerCase() === mtlName) ?? sidecars.find((f) => f.name.toLowerCase().endsWith('.mtl'));
  // Diffuse colours straight from the .mtl (Kd is sRGB in practice).
  const kd = new Map<string, string>();
  if (mtlFile) {
    let current = '';
    for (const line of (await mtlFile.text()).split(/\r?\n/)) {
      const t = line.trim().split(/\s+/);
      if (t[0] === 'newmtl') current = t.slice(1).join(' ');
      else if (t[0] === 'Kd' && current && t.length >= 4) {
        const h = (v: string) => Math.round(Math.min(1, Math.max(0, parseFloat(v) || 0)) * 255).toString(16).padStart(2, '0');
        kd.set(current, `#${h(t[1]!)}${h(t[2]!)}${h(t[3]!)}`);
      }
    }
  }
  const group = loader.parse(text);
  let colored = false;
  group.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    const mats: Material[] = Array.isArray(node.material) ? node.material : [node.material];
    for (const m of mats) {
      const hex = kd.get(m.name) ?? (/(?:^|_)([0-9a-f]{6})$/i.exec(m.name)?.[1] ? `#${/(?:^|_)([0-9a-f]{6})$/i.exec(m.name)![1]}` : null);
      const c = (m as Material & { color?: Color }).color;
      if (hex && c) {
        c.setStyle(hex);
        colored = true;
      }
    }
  });
  if (!colored) {
    group.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      const mats: Material[] = Array.isArray(node.material) ? node.material : [node.material];
      mats.forEach((m) => m.dispose());
      node.material = createModelMaterial(Boolean(node.geometry.getAttribute('color')));
    });
  }
  return group;
}

/**
 * Parses .glb or .gltf. A .gltf can reference external .bin / texture files;
 * those are resolved from `sidecars` (files dropped or picked together with it)
 * so nothing is ever fetched from the network.
 */
export async function parseGltf(buffer: ArrayBuffer, sidecars: File[]): Promise<Object3D> {
  const byName = new Map(sidecars.map((f) => [f.name.toLowerCase(), f]));
  const blobUrls: string[] = [];
  const missing = new Set<string>();

  const manager = new LoadingManager();
  manager.setURLModifier((url) => {
    if (/^(data|blob):/i.test(url)) return url;
    const clean = decodeURIComponent(url.split(/[?#]/)[0] ?? url);
    const base = clean.slice(clean.lastIndexOf('/') + 1).toLowerCase();
    const file = byName.get(base);
    if (file) {
      const blobUrl = URL.createObjectURL(file);
      blobUrls.push(blobUrl);
      return blobUrl;
    }
    missing.add(base || clean);
    // Point at an empty data URL instead of the server; the loader then fails
    // and we report which file was missing.
    return 'data:application/octet-stream;base64,';
  });

  const loader = new GLTFLoader(manager);
  loader.setMeshoptDecoder(MeshoptDecoder);

  try {
    const gltf = await loader.parseAsync(buffer, '');
    if (missing.size) throw new LoadError(missingMessage(missing));
    const root = gltf.scene ?? gltf.scenes[0];
    if (!root) throw new LoadError('This glTF file has no scene to show.');
    return root;
  } catch (err) {
    if (err instanceof LoadError) throw err;
    if (missing.size) throw new LoadError(missingMessage(missing));
    const msg = err instanceof Error ? err.message : String(err);
    if (/DRACOLoader/i.test(msg)) {
      throw new LoadError('This glTF uses Draco mesh compression, which is not supported yet. Re-export it without Draco (or as an uncompressed .glb).');
    }
    if (/KTX2|basisu/i.test(msg)) {
      throw new LoadError('This glTF uses KTX2/Basis textures, which are not supported yet. Re-export it with PNG or JPEG textures.');
    }
    throw new LoadError(`Could not read this glTF/GLB file. It may be corrupted or truncated. (${msg})`);
  } finally {
    // Textures are decoded by now; the blob URLs are no longer needed.
    blobUrls.forEach((u) => URL.revokeObjectURL(u));
  }
}

function missingMessage(missing: Set<string>): string {
  const list = [...missing].slice(0, 4).join(', ');
  return `This .gltf needs files that were not provided: ${list}${missing.size > 4 ? ', …' : ''}. Select or drop the .gltf together with those files, or use a single .glb.`;
}

/** True for files that may accompany a .gltf (buffers, textures). */
export function isSidecar(file: File): boolean {
  return ['bin', 'png', 'jpg', 'jpeg', 'webp', 'ktx2', 'mtl'].includes(extensionOf(file.name));
}
