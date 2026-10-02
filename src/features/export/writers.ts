import { BufferAttribute, BufferGeometry, Group, Mesh, MeshStandardMaterial, Scene } from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { weld } from '../../geometry/meshOps';
import { zUpToYUp } from '../../scene/fromThree';
import { worldPositions } from '../../scene/geometry';
import { hexToRgb255 } from '../../scene/palette';
import type { SceneObject } from '../../scene/types';
import type { Unit } from '../../settings/units';
import { unitToMm } from '../../settings/units';

export interface ExportPart {
  name: string;
  positions: Float32Array;
  faceColors: Uint16Array;
}

export interface ExportOptions {
  units: Unit;
  upAxis: 'z' | 'y';
}

/** World-space parts converted to the requested units and up axis. */
export function prepareParts(objects: SceneObject[], opts: ExportOptions, replaced?: Map<string, { positions: Float32Array; faceColors: Uint16Array }>): ExportPart[] {
  const k = 1 / unitToMm(1, opts.units);
  return objects.map((o) => {
    const r = replaced?.get(o.id);
    const positions = r ? r.positions.slice() : worldPositions(o);
    if (k !== 1) for (let i = 0; i < positions.length; i++) positions[i]! *= k;
    if (opts.upAxis === 'y') zUpToYUp(positions);
    return { name: o.name, positions, faceColors: r ? r.faceColors : o.faceColors };
  });
}

export function mergeParts(parts: ExportPart[], name: string): ExportPart {
  const tris = parts.reduce((s, p) => s + p.faceColors.length, 0);
  const positions = new Float32Array(tris * 9);
  const faceColors = new Uint16Array(tris);
  let o = 0;
  for (const p of parts) {
    positions.set(p.positions, o * 9);
    faceColors.set(p.faceColors, o);
    o += p.faceColors.length;
  }
  return { name, positions, faceColors };
}

function normal(p: Float32Array, o: number): [number, number, number] {
  const ax = p[o + 3]! - p[o]!, ay = p[o + 4]! - p[o + 1]!, az = p[o + 5]! - p[o + 2]!;
  const bx = p[o + 6]! - p[o]!, by = p[o + 7]! - p[o + 1]!, bz = p[o + 8]! - p[o + 2]!;
  const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
  const l = Math.hypot(nx, ny, nz) || 1;
  return [nx / l, ny / l, nz / l];
}

export function stlBinary(part: ExportPart): ArrayBuffer {
  const n = part.faceColors.length;
  const buf = new ArrayBuffer(84 + n * 50);
  const dv = new DataView(buf);
  const header = new TextEncoder().encode(`Mesh Studio: ${part.name}`.slice(0, 79));
  new Uint8Array(buf).set(header, 0);
  dv.setUint32(80, n, true);
  const p = part.positions;
  for (let t = 0; t < n; t++) {
    const o = 84 + t * 50;
    const [nx, ny, nz] = normal(p, t * 9);
    dv.setFloat32(o, nx, true); dv.setFloat32(o + 4, ny, true); dv.setFloat32(o + 8, nz, true);
    for (let k = 0; k < 9; k++) dv.setFloat32(o + 12 + k * 4, p[t * 9 + k]!, true);
  }
  return buf;
}

export function stlAscii(part: ExportPart): string {
  const name = part.name.replace(/\s+/g, '_') || 'mesh';
  const p = part.positions;
  const lines: string[] = [`solid ${name}`];
  const f = (v: number) => v.toExponential(6);
  for (let t = 0; t < part.faceColors.length; t++) {
    const o = t * 9;
    const [nx, ny, nz] = normal(p, o);
    lines.push(` facet normal ${f(nx)} ${f(ny)} ${f(nz)}`, '  outer loop');
    for (let k = 0; k < 3; k++) lines.push(`   vertex ${f(p[o + k * 3]!)} ${f(p[o + k * 3 + 1]!)} ${f(p[o + k * 3 + 2]!)}`);
    lines.push('  endloop', ' endfacet');
  }
  lines.push(`endsolid ${name}`, '');
  return lines.join('\n');
}

/** Material names carry the colour (mat_rrggbb) so colours survive even without the .mtl. */
const matName = (hex: string) => `mat_${hex.replace('#', '').toLowerCase()}`;

export function objWithMtl(parts: ExportPart[], baseName: string, palette: string[]): { obj: string; mtl: string } {
  const out: string[] = ['# Mesh Studio OBJ export', `mtllib ${baseName}.mtl`];
  const used = new Set<number>();
  let offset = 0;
  for (const part of parts) {
    const { index, verts, count } = weld(part.positions, 1e-6);
    out.push(`o ${part.name.replace(/\s+/g, '_') || 'mesh'}`);
    for (let v = 0; v < count; v++) out.push(`v ${+verts[v * 3]!.toFixed(6)} ${+verts[v * 3 + 1]!.toFixed(6)} ${+verts[v * 3 + 2]!.toFixed(6)}`);
    // faces grouped by colour
    const order = Array.from(part.faceColors.keys()).sort((a, b) => part.faceColors[a]! - part.faceColors[b]!);
    let cur = -1;
    for (const t of order) {
      const c = part.faceColors[t]!;
      if (c !== cur) {
        cur = c;
        used.add(c);
        out.push(`usemtl ${matName(palette[c] ?? palette[0]!)}`);
      }
      out.push(`f ${index[t * 3]! + 1 + offset} ${index[t * 3 + 1]! + 1 + offset} ${index[t * 3 + 2]! + 1 + offset}`);
    }
    offset += count;
  }
  const mtl: string[] = ['# Mesh Studio materials'];
  for (const c of [...used].sort((a, b) => a - b)) {
    const hex = palette[c] ?? palette[0]!;
    const [r, g, b] = hexToRgb255(hex);
    mtl.push(`newmtl ${matName(hex)}`, `Kd ${(r / 255).toFixed(4)} ${(g / 255).toFixed(4)} ${(b / 255).toFixed(4)}`, 'Ka 0 0 0', 'Ks 0 0 0', 'd 1', 'illum 1', '');
  }
  out.push('');
  return { obj: out.join('\n'), mtl: mtl.join('\n') };
}

/** Binary glTF; one material per palette colour (glTF is always Y-up: callers pass upAxis 'y'). */
export async function glb(parts: ExportPart[], palette: string[]): Promise<ArrayBuffer> {
  const scene = new Scene();
  const root = new Group();
  root.name = 'Mesh Studio';
  scene.add(root);
  const materials = new Map<number, MeshStandardMaterial>();
  const mat = (c: number) => {
    let m = materials.get(c);
    if (!m) {
      m = new MeshStandardMaterial({ color: palette[c] ?? palette[0], roughness: 0.6, metalness: 0 });
      m.name = matName(palette[c] ?? palette[0]!);
      materials.set(c, m);
    }
    return m;
  };
  for (const part of parts) {
    const order = Array.from(part.faceColors.keys()).sort((a, b) => part.faceColors[a]! - part.faceColors[b]!);
    const pos = new Float32Array(part.positions.length);
    order.forEach((t, i) => pos.set(part.positions.subarray(t * 9, t * 9 + 9), i * 9));
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.computeVertexNormals();
    const mats: MeshStandardMaterial[] = [];
    let start = 0;
    for (let i = 0; i <= order.length; i++) {
      const c = i < order.length ? part.faceColors[order[i]!]! : -1;
      const prev = i > 0 ? part.faceColors[order[i - 1]!]! : -2;
      if (i > 0 && c !== prev) {
        g.addGroup(start * 3, (i - start) * 3, mats.length);
        mats.push(mat(prev));
        start = i;
      }
    }
    const mesh = new Mesh(g, mats.length === 1 ? mats[0] : mats);
    mesh.name = part.name;
    root.add(mesh);
  }
  const result = await new GLTFExporter().parseAsync(scene, { binary: true });
  scene.traverse((n) => n instanceof Mesh && n.geometry.dispose());
  materials.forEach((m) => m.dispose());
  return result as ArrayBuffer;
}

export function saveBlob(name: string, data: Blob | ArrayBuffer | string, type = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'model';
