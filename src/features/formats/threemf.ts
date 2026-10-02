import JSZip from 'jszip';
import { Matrix4, Vector3 } from 'three';
import { weld } from '../../geometry/meshOps';
import { hexToRgb255, paletteIndexFor } from '../../scene/palette';
import { createObject } from '../../scene/create';
import { useSceneStore } from '../../store/useSceneStore';
import type { SceneObject } from '../../scene/types';
import type { ExportPart } from '../export/writers';
import type { Unit } from '../../settings/units';
import { dominantState, encodeTriangleState } from '../../ported/threemf/paintEncoding';

// ------------------------------------------------------------------ export

const UNIT_NAME: Record<Unit, string> = { mm: 'millimeter', cm: 'centimeter', in: 'inch' };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const num = (v: number) => String(+v.toFixed(6));

export type ThreeMfColours =
  /** Bambu Studio / PrusaSlicer multi-material painting: palette colour k → filament slot, every triangle painted. */
  | 'slicer'
  /** Standard Materials extension (basematerials), read by Windows 3D apps and most viewers. */
  | 'standard';

/** Palette indices used by the parts, in slot order (filament 1, 2, …). */
export function filamentSlots(parts: ExportPart[]): number[] {
  return [...new Set(parts.flatMap((p) => [...new Set(p.faceColors)]))].sort((a, b) => a - b);
}

/**
 * 3MF, one object per part. `standard`: per-triangle colours via basematerials.
 * `slicer`: per-triangle `paint_color` (Bambu Studio) and `slic3rpe:mmu_segmentation`
 * (PrusaSlicer) so the painting opens as filament assignments; the slot colours are
 * also stored as metadata so Mesh Studio reads its own colours back.
 */
export async function build3mf(parts: ExportPart[], palette: string[], unit: Unit, colours: ThreeMfColours = 'standard'): Promise<Blob> {
  const used = filamentSlots(parts);
  const slot = new Map(used.map((c, i) => [c, i]));
  const hexOf = (c: number) => {
    const [r, g, b] = hexToRgb255(palette[c] ?? palette[0]!);
    return [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
  };
  const slicer = colours === 'slicer';
  const xml: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<model unit="${UNIT_NAME[unit]}" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02"${slicer ? ' xmlns:slic3rpe="http://schemas.slic3r.org/3mf/2017/06"' : ''}>`,
    ' <metadata name="Application">Mesh Studio</metadata>',
    ...(slicer
      ? [' <metadata name="slic3rpe:MmPaintingVersion">1</metadata>', ` <metadata name="MeshStudio:FilamentColours">${used.map((c) => '#' + hexOf(c)).join(';')}</metadata>`]
      : []),
    ' <resources>',
  ];
  if (!slicer) {
    xml.push('  <basematerials id="1">', ...used.map((c, i) => `   <base name="Colour ${i + 1}" displaycolor="#${hexOf(c)}FF"/>`), '  </basematerials>');
  }
  const codes = used.map((_, i) => encodeTriangleState(i + 1));
  parts.forEach((p, i) => {
    const { index, verts, count } = weld(p.positions, 1e-6);
    const id = i + 2;
    const objSlot = slot.get(p.faceColors[0] ?? 0) ?? 0;
    xml.push(slicer ? `  <object id="${id}" type="model" name="${esc(p.name)}">` : `  <object id="${id}" type="model" name="${esc(p.name)}" pid="1" pindex="${objSlot}">`, '   <mesh>', '    <vertices>');
    for (let v = 0; v < count; v++) xml.push(`     <vertex x="${num(verts[v * 3]!)}" y="${num(verts[v * 3 + 1]!)}" z="${num(verts[v * 3 + 2]!)}"/>`);
    xml.push('    </vertices>', '    <triangles>');
    for (let t = 0; t < p.faceColors.length; t++) {
      const s = slot.get(p.faceColors[t]!) ?? 0;
      const attrs = slicer ? ` paint_color="${codes[s]}" slic3rpe:mmu_segmentation="${codes[s]}"` : s !== objSlot ? ` pid="1" p1="${s}"` : '';
      xml.push(`     <triangle v1="${index[t * 3]}" v2="${index[t * 3 + 1]}" v3="${index[t * 3 + 2]}"${attrs}/>`);
    }
    xml.push('    </triangles>', '   </mesh>', '  </object>');
  });
  xml.push(' </resources>', ' <build>', ...parts.map((_, i) => `  <item objectid="${i + 2}"/>`), ' </build>', '</model>');
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>');
  zip.file('3D/3dmodel.model', xml.join('\n'));
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'model/3mf' });
}

// ------------------------------------------------------------------ import

const UNIT_MM: Record<string, number> = { micron: 0.001, millimeter: 1, centimeter: 10, inch: 25.4, foot: 304.8, meter: 1000 };

/** 3MF transform "m00 m01 m02 m10 m11 m12 m20 m21 m22 m30 m31 m32" (row vectors) → Matrix4. */
function parseTransform(t: string | null): Matrix4 {
  const m = new Matrix4();
  if (!t) return m;
  const v = t.trim().split(/\s+/).map(Number);
  if (v.length !== 12 || v.some((x) => !Number.isFinite(x))) return m;
  m.set(v[0]!, v[3]!, v[6]!, v[9]!, v[1]!, v[4]!, v[7]!, v[10]!, v[2]!, v[5]!, v[8]!, v[11]!, 0, 0, 0, 1);
  return m;
}

interface ParsedObject {
  name: string;
  /** Soup in object space plus colour hex per triangle. */
  positions?: Float32Array;
  colors?: Array<string | null>;
  /** Bambu / Prusa painted filament per triangle (1-based), 0 = not painted. */
  paint?: Uint16Array;
  components: Array<{ objectId: string; path: string | null; transform: Matrix4 }>;
}

type ModelDoc = { objects: Map<string, ParsedObject>; unitScale: number; meta: Map<string, string> };

const local = (el: Element) => el.localName;
const children = (el: Element, name: string) => Array.from(el.children).filter((c) => local(c) === name);

function parseModel(text: string): ModelDoc {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('The 3MF model XML is malformed.');
  const model = doc.documentElement;
  const unitScale = UNIT_MM[model.getAttribute('unit') ?? 'millimeter'] ?? 1;
  const colorSets = new Map<string, string[]>();
  for (const el of Array.from(doc.getElementsByTagNameNS('*', 'basematerials')))
    colorSets.set(el.getAttribute('id') ?? '', children(el, 'base').map((b) => (b.getAttribute('displaycolor') ?? '#ffffff').slice(0, 7)));
  for (const el of Array.from(doc.getElementsByTagNameNS('*', 'colorgroup')))
    colorSets.set(el.getAttribute('id') ?? '', children(el, 'color').map((c) => (c.getAttribute('color') ?? '#ffffff').slice(0, 7)));
  const objects = new Map<string, ParsedObject>();
  for (const el of Array.from(doc.getElementsByTagNameNS('*', 'object'))) {
    const id = el.getAttribute('id') ?? '';
    const o: ParsedObject = { name: el.getAttribute('name') ?? `Object ${id}`, components: [] };
    const objPid = el.getAttribute('pid');
    const objIndex = el.getAttribute('pindex');
    const mesh = children(el, 'mesh')[0];
    if (mesh) {
      const vs = children(children(mesh, 'vertices')[0] ?? mesh, 'vertex');
      const verts = new Float32Array(vs.length * 3);
      vs.forEach((v, i) => {
        verts[i * 3] = +(v.getAttribute('x') ?? 0); verts[i * 3 + 1] = +(v.getAttribute('y') ?? 0); verts[i * 3 + 2] = +(v.getAttribute('z') ?? 0);
      });
      const ts = children(children(mesh, 'triangles')[0] ?? mesh, 'triangle');
      const pos = new Float32Array(ts.length * 9);
      const colors: Array<string | null> = [];
      const paint = new Uint16Array(ts.length);
      let painted = false;
      ts.forEach((t, i) => {
        const code = t.getAttribute('paint_color') || t.getAttribute('slic3rpe:mmu_segmentation');
        if (code) {
          const st = dominantState(code);
          if (st) { paint[i] = st; painted = true; }
        }
        const idx = [+(t.getAttribute('v1') ?? 0), +(t.getAttribute('v2') ?? 0), +(t.getAttribute('v3') ?? 0)];
        idx.forEach((vi, k) => pos.set(verts.subarray(vi * 3, vi * 3 + 3), i * 9 + k * 3));
        const pid = t.getAttribute('pid') ?? objPid;
        const p1 = t.getAttribute('p1') ?? objIndex;
        const set = pid ? colorSets.get(pid) : undefined;
        colors.push(set && p1 != null ? set[+p1] ?? null : null);
      });
      o.positions = pos;
      o.colors = colors;
      if (painted) o.paint = paint;
    }
    for (const comps of children(el, 'components')) {
      for (const c of children(comps, 'component')) {
        const path = Array.from(c.attributes).find((a) => a.localName === 'path')?.value ?? null;
        o.components.push({ objectId: c.getAttribute('objectid') ?? '', path, transform: parseTransform(c.getAttribute('transform')) });
      }
    }
    objects.set(id, o);
  }
  const meta = new Map<string, string>();
  for (const el of children(model, 'metadata')) meta.set(el.getAttribute('name') ?? '', el.textContent ?? '');
  return { objects, unitScale, meta };
}

/** Opens a .3mf: every build item becomes one object (components flattened, colours kept). */
export async function load3mf(file: File, existing: SceneObject[]): Promise<SceneObject[]> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const models = new Map<string, ModelDoc>();
  for (const name of Object.keys(zip.files).filter((n) => n.toLowerCase().endsWith('.model'))) {
    models.set('/' + name.replace(/^\//, ''), parseModel(await zip.file(name)!.async('string')));
  }
  if (!models.size) throw new Error(`${file.name} has no 3D model inside.`);
  const rels = await zip.file('_rels/.rels')?.async('string');
  const rootPath = (rels && /Target="([^"]+\.model)"/i.exec(rels)?.[1]) || [...models.keys()][0]!;
  const root = models.get(rootPath.startsWith('/') ? rootPath : '/' + rootPath) ?? [...models.values()][0]!;
  const doc = new DOMParser().parseFromString(await zip.file((rootPath.startsWith('/') ? rootPath.slice(1) : rootPath))!.async('string'), 'application/xml');
  const items = Array.from(doc.getElementsByTagNameNS('*', 'item'));
  const palette = [...useSceneStore.getState().palette];
  const out: SceneObject[] = [];
  const filaments = await filamentColours(zip, root);
  const extruders = await objectExtruders(zip);
  const filamentIndex = (k: number) => paletteIndexFor(palette, filaments[k - 1] ?? DEFAULT_FILAMENTS[(k - 1) % DEFAULT_FILAMENTS.length]!);
  let current = 1; // default filament of the build item being collected

  const collect = (model: ModelDoc, id: string, m: Matrix4, acc: { pos: number[]; col: number[] }, depth = 0) => {
    const o = model.objects.get(id);
    if (!o || depth > 16) return;
    if (o.positions) {
      const v = new Vector3();
      const mirror = m.determinant() < 0;
      for (let t = 0; t < o.positions.length / 9; t++) {
        const order = mirror ? [0, 2, 1] : [0, 1, 2];
        for (const k of order) {
          v.set(o.positions[t * 9 + k * 3]!, o.positions[t * 9 + k * 3 + 1]!, o.positions[t * 9 + k * 3 + 2]!).applyMatrix4(m).multiplyScalar(model.unitScale);
          acc.pos.push(v.x, v.y, v.z);
        }
        const painted = o.paint?.[t];
        const hex = o.colors?.[t];
        if (painted) acc.col.push(filamentIndex(painted));
        else if (hex && hex.toLowerCase() !== '#ffffff') acc.col.push(paletteIndexFor(palette, hex));
        else acc.col.push(slicerFile ? filamentIndex(current) : 0);
      }
    }
    for (const c of o.components) {
      const target = c.path ? models.get(c.path.startsWith('/') ? c.path : '/' + c.path) ?? model : model;
      collect(target, c.objectId, m.clone().multiply(c.transform), acc, depth + 1);
    }
  };

  const slicerFile = [...models.values()].some((md) => [...md.objects.values()].some((o) => o.paint));
  const list = items.length ? items.map((it) => ({ id: it.getAttribute('objectid') ?? '', t: parseTransform(it.getAttribute('transform')) })) : [...root.objects.keys()].map((id) => ({ id, t: new Matrix4() }));
  for (const it of list) {
    const acc = { pos: [] as number[], col: [] as number[] };
    current = extruders.get(it.id) ?? 1;
    collect(root, it.id, it.t, acc);
    if (!acc.col.length) continue;
    const name = root.objects.get(it.id)?.name ?? file.name.replace(/\.3mf$/i, '');
    out.push(createObject(name, new Float32Array(acc.pos), Uint16Array.from(acc.col), { kind: 'file', format: '3mf', fileName: file.name }, 'beside', [...existing, ...out]));
  }
  if (!out.length) throw new Error(`${file.name} contains no triangles.`);
  if (palette.length !== useSceneStore.getState().palette.length) useSceneStore.setState({ palette });
  return out;
}

/** Fallback filament colours when a painted 3MF carries none (distinct, readable). */
const DEFAULT_FILAMENTS = ['#b58fd0', '#ef6b73', '#7fb4ff', '#5ad1a0', '#f0b64e', '#ff8f40', '#f5f0ff', '#2b2b2b'];

/** Filament colours: Mesh Studio metadata, Bambu project_settings.config, or PrusaSlicer Slic3r_PE.config. */
async function filamentColours(zip: JSZip, root: ModelDoc): Promise<string[]> {
  const ours = root.meta.get('MeshStudio:FilamentColours');
  if (ours) return ours.split(';').filter((c) => /^#[0-9a-f]{6}$/i.test(c));
  const bambu = zip.file(/^Metadata\/project_settings\.config$/i)[0];
  if (bambu) {
    try {
      const cfg = JSON.parse(await bambu.async('string')) as { filament_colour?: string[] };
      if (Array.isArray(cfg.filament_colour)) return cfg.filament_colour.map((c) => String(c).slice(0, 7));
    } catch { /* not JSON */ }
  }
  const prusa = zip.file(/^Metadata\/Slic3r_PE\.config$/i)[0];
  if (prusa) {
    const text = await prusa.async('string');
    const pick = (key: string) => new RegExp(`^;\\s*${key}\\s*=\\s*(.*)$`, 'm').exec(text)?.[1]?.split(';').map((c) => c.trim().replace(/"/g, '')) ?? [];
    const ext = pick('extruder_colour'), fil = pick('filament_colour');
    const n = Math.max(ext.length, fil.length);
    const out: string[] = [];
    for (let i = 0; i < n; i++) out.push(/^#[0-9a-f]{6}/i.test(ext[i] ?? '') ? ext[i]!.slice(0, 7) : (fil[i] ?? '#b58fd0').slice(0, 7));
    if (out.length) return out;
  }
  return [];
}

/** Object-level default extruder (1-based) by build object id, from Bambu or PrusaSlicer model config. */
async function objectExtruders(zip: JSZip): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const file = zip.file(/^Metadata\/(model_settings|Slic3r_PE_model)\.config$/i)[0];
  if (!file) return out;
  const doc = new DOMParser().parseFromString(await file.async('string'), 'application/xml');
  for (const obj of Array.from(doc.getElementsByTagName('object'))) {
    const id = obj.getAttribute('id');
    const meta = Array.from(obj.children).find((c) => c.tagName === 'metadata' && c.getAttribute('key') === 'extruder' && (c.getAttribute('type') ?? 'object') === 'object');
    const v = Number(meta?.getAttribute('value'));
    if (id && v >= 1) out.set(id, v);
  }
  return out;
}
