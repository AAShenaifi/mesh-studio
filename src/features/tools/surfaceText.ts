import { useEffect } from 'react';
import { Vector3 } from 'three';
import { fontById, fontFiles } from './fonts';
import { create } from 'zustand';
import { useAppStore } from '../../store/useAppStore';
import { useSceneStore } from '../../store/useSceneStore';
import { createObject } from '../../scene/create';
import type { SceneObject } from '../../scene/types';
import { kernel, kernelMesh } from '../../geometry/kernel';
import type { KernelMesh } from '../../geometry/protocol';
import type { Extrude2DArgs } from '../../geometry/kernelOps';
import { stlToSoup } from '../../loaders/stlSoup';
import { viewportHandlers } from '../../viewport/SceneObjects';
import { renderScad } from '../scad/scad';
import { ScadError } from '../generators/generate';
import { svgToRegions } from '../formats/svg';
import { imageToRegions } from './imageShape';
import { buildWrapTable } from './wrapTable';

/** Half extents (x, y) of a centred flat shape soup. */
export function halfSize(p: Float32Array): [number, number] {
  let hx = 0, hy = 0;
  for (let i = 0; i < p.length; i += 3) { hx = Math.max(hx, Math.abs(p[i]!)); hy = Math.max(hy, Math.abs(p[i + 1]!)); }
  return [hx, hy];
}
import { originalTriangle, trianglesInSphere } from '../paint/meshQuery';
import { objectMatrix, worldBox } from '../../scene/geometry';
import { Matrix4 } from 'three';
import { worldFaceNormal } from '../prep/orient';



export interface TextSettings {
  text: string;
  font: string;
  size: number;
  mode: 'engrave' | 'emboss';
  depth: number;
  dx: number;
  dy: number;
  rotation: number;
  /** Flat on the top face (OpenSCAD) or projected onto the surface where you click. */
  placement: 'top' | 'surface';
  source: 'text' | 'svg' | 'image';
  svg: { name: string; text: string } | null;
  /** Logo from a picture: traced to an outline (dark parts, or the light parts when inverted). */
  image: { name: string; blob: Blob } | null;
  imgThreshold: number;
  imgInvert: boolean;
  /** SVG width on the model, mm. */
  svgWidth: number;
  /** Palette index for the text, or -1 for the object's colour. */
  color: number;
  /** Where the text will go on a clicked surface (surface placement). */
  anchor: { objectId: string; point: [number, number, number]; normal: [number, number, number] } | null;
  /** Cursor-follow position while choosing a spot. */
  hover: { objectId: string; point: [number, number, number]; normal: [number, number, number] } | null;
  /** On surface: bend along the surface like a sticker, or project straight along the click normal. */
  wrap: 'wrap' | 'project';
  /** Show the live preview in the viewport (the Add text panel is open). */
  previewOn: boolean;
  set: (patch: Partial<Omit<TextSettings, 'set'>>) => void;
}

export const useTextStore = create<TextSettings>()((set) => ({
  text: 'V1',
  font: 'sans',
  size: 6,
  mode: 'engrave',
  depth: 0.8,
  dx: 0,
  dy: 0,
  rotation: 0,
  placement: 'top',
  source: 'text',
  svg: null,
  image: null,
  imgThreshold: 128,
  imgInvert: false,
  svgWidth: 20,
  color: -1,
  anchor: null,
  hover: null,
  previewOn: false,
  wrap: 'wrap',
  set: (patch) => set(patch),
}));

const shapeCache = new Map<string, KernelMesh>();

/** Flat shape (centred, z 0…1) for the current text or SVG. */
export async function flatShape(s: TextSettings): Promise<KernelMesh> {
  const key = s.source === 'svg' ? `svg:${s.svg?.name}:${s.svg?.text.length}:${s.svgWidth}` : s.source === 'image' ? `img:${s.image?.name}:${s.image?.blob.size}:${s.imgThreshold}:${s.imgInvert}:${s.svgWidth}` : `txt:${s.text}:${s.font}:${s.size}`;
  const hit = shapeCache.get(key);
  if (hit) return { positions: hit.positions.slice(), faceColors: hit.faceColors.slice() };
  let mesh: KernelMesh;
  if (s.source !== 'text') {
    if (s.source === 'svg' && !s.svg) throw new Error('Choose an SVG file first.');
    if (s.source === 'image' && !s.image) throw new Error('Choose a picture first.');
    const { regions, width } = s.source === 'svg' ? svgToRegions(s.svg!.text) : await imageToRegions(s.image!.blob, s.imgThreshold, s.imgInvert);
    const r = await kernel<{ mesh: KernelMesh }>('extrude2d', { regions, depth: 1, scale: s.svgWidth / Math.max(width, 1e-6), flipY: true, color: 0, minArea: 0 } satisfies Extrude2DArgs);
    mesh = r.mesh;
  } else {
    const font = fontById(s.font).name;
    const code = `txt = "A"; fontname = "Liberation Sans"; size = 6;
ar = len([for (c = txt) if (ord(c) >= 1536 && ord(c) <= 1791) 1]) > 0;
linear_extrude(1) text(txt, size = size, font = fontname, halign = "center", valign = "center", direction = ar ? "rtl" : "ltr", script = ar ? "arabic" : "latin");`;
    const r = await renderScad(code, { txt: JSON.stringify(s.text), fontname: JSON.stringify(font), size: String(s.size) }, await fontFiles(s.font));
    if (!r.ok || !r.stl) throw new ScadError(r.log);
    const soup = stlToSoup(r.stl);
    mesh = { positions: soup.positions, faceColors: new Uint16Array(soup.faceColors.length) };
  }
  shapeCache.set(key, { positions: mesh.positions.slice(), faceColors: mesh.faceColors.slice() });
  return mesh;
}

/** Projects the current text/SVG onto `o` at a world point with the given surface normal (one undo step). */
export async function placeOnSurface(o: SceneObject, point: Vector3, normal: Vector3) {
  const s = useTextStore.getState();
  const scene = useSceneStore.getState();
  const what = s.source === 'svg' ? s.svg?.name ?? 'SVG' : s.source === 'image' ? s.image?.name ?? 'image' : `“${s.text}”`;
  const res = await useAppStore.getState().run(s.mode === 'engrave' ? 'Engraving on the surface' : 'Embossing on the surface', async () => {
    const shape = await flatShape(s);
    const wrap = s.wrap === 'wrap' ? buildWrapTable(o, 'wrap', point.toArray() as [number, number, number], normal.toArray() as [number, number, number], s.rotation, ...halfSize(shape.positions)) : undefined;
    // "up" in the text follows world +Z, so lettering on a wall reads upright
    return kernel<{ mesh: KernelMesh; misses: number; volume: number }>('surfaceShape', {
      mesh: kernelMesh(o),
      shape,
      point: point.toArray(),
      normal: normal.toArray(),
      up: [0, 0, 1],
      rotation: s.rotation,
      mode: s.mode,
      height: s.depth,
      color: s.color >= 0 ? s.color : null,
      paletteSize: scene.palette.length,
      ...(wrap ? { wrap } : {}),
    });
  });
  if (!res) return false;
  const out = createObject(o.name, res.mesh.positions, res.mesh.faceColors, { kind: 'tool' }, 'keep');
  useSceneStore.getState().replaceObjects(`${s.mode === 'engrave' ? 'Engrave' : 'Emboss'} ${what} on surface`, [o.id], [{ ...out, id: o.id, visible: o.visible }]);
  useTextStore.getState().set({ anchor: null, hover: null });
  useAppStore.getState().setReady(`${s.mode === 'engrave' ? 'Engraved' : 'Embossed'} ${what} on the surface${res.misses ? ' (part of it hangs over the edge)' : ''}`);
  return true;
}

/** Surface normal around the click (area around a quarter of the text size), so small facets do not tilt the text. */
function averagedNormal(o: SceneObject, tri: number, point: Vector3): Vector3 {
  const n0 = worldFaceNormal(o, tri);
  const s = useTextStore.getState();
  const radius = Math.max(0.5, (s.source !== 'text' ? s.svgWidth : s.size) / 4);
  const local = point.clone().applyMatrix4(new Matrix4().copy(objectMatrix(o)).invert());
  const scale = (Math.abs(o.scale[0]) + Math.abs(o.scale[1]) + Math.abs(o.scale[2])) / 3 || 1;
  const sum = new Vector3();
  const p = o.geometry.getAttribute('position').array as Float32Array;
  const a = new Vector3(), b = new Vector3(), c = new Vector3();
  const m = objectMatrix(o);
  for (const t of trianglesInSphere(o.geometry, local, radius / scale).slice(0, 5000)) {
    a.set(p[t * 9]!, p[t * 9 + 1]!, p[t * 9 + 2]!).applyMatrix4(m);
    b.set(p[t * 9 + 3]!, p[t * 9 + 4]!, p[t * 9 + 5]!).applyMatrix4(m);
    c.set(p[t * 9 + 6]!, p[t * 9 + 7]!, p[t * 9 + 8]!).applyMatrix4(m);
    const n = b.sub(a).cross(c.sub(a)); // length = 2 × area
    if (n.dot(n0) > 0) sum.add(n);
  }
  return sum.lengthSq() > 0 ? sum.normalize() : n0;
}

/** Viewport tool: pick the spot. The preview follows the cursor; one click fixes it (then Apply). */
export function SurfaceTextTool() {
  const active = useAppStore((s) => s.activeTool === 'surfacetext');
  useEffect(() => {
    if (!active) return;
    let last = 0;
    viewportHandlers.pointer = (e, o, kind) => {
      if (kind !== 'move' || e.faceIndex == null) return false;
      const now = performance.now();
      if (now - last < 40) return false;
      last = now;
      const t = useTextStore.getState();
      if (t.placement === 'top') {
        const sel = useSceneStore.getState();
        const target = sel.selectedIds.length === 1 ? sel.objects.find((x) => x.id === sel.selectedIds[0]) : undefined;
        if (!target || target.id !== o.id) return false;
        const box = worldBox(target);
        t.set({ dx: +(e.point.x - (box.min.x + box.max.x) / 2).toFixed(2), dy: +(e.point.y - (box.min.y + box.max.y) / 2).toFixed(2) });
      } else {
        const n = worldFaceNormal(o, originalTriangle(o.geometry, e.faceIndex));
        t.set({ hover: { objectId: o.id, point: e.point.toArray() as [number, number, number], normal: n.toArray() as [number, number, number] } });
      }
      return false;
    };
    viewportHandlers.click = (e, o) => {
      if (e.faceIndex == null) return true;
      const t = useTextStore.getState();
      if (t.placement === 'top') {
        const box = worldBox(o);
        t.set({ dx: +(e.point.x - (box.min.x + box.max.x) / 2).toFixed(2), dy: +(e.point.y - (box.min.y + box.max.y) / 2).toFixed(2) });
      } else {
        const n = averagedNormal(o, originalTriangle(o.geometry, e.faceIndex), e.point);
        t.set({ anchor: { objectId: o.id, point: e.point.toArray() as [number, number, number], normal: n.toArray() as [number, number, number] }, hover: null });
      }
      useAppStore.getState().setActiveTool(null);
      return true;
    };
    return () => {
      viewportHandlers.click = null;
      viewportHandlers.pointer = null;
      useTextStore.getState().set({ hover: null });
    };
  }, [active]);
  return null;
}
