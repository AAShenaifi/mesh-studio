import { glb, objWithMtl, stlAscii, stlBinary, type ExportPart } from './writers';
import { amfFile, plyFile, scadFile, stepFile } from './moreWriters';
import { laserDxf, laserSvg } from './laser';

export interface OutFile {
  name: string;
  data: ArrayBuffer | string | Blob;
}

export interface ExportFormat {
  id: string;
  label: string;
  ext: string;
  /** Format mandates an up axis (glTF is Y-up). */
  forceUp?: 'y' | 'z';
  /** Format stores colours. */
  colors: boolean;
  /** Colours become filament slots (1, 2, …) in a slicer; the dialog lists the mapping. */
  filamentSlots?: boolean;
  build: (parts: ExportPart[], baseName: string, palette: string[], ctx: { units: import('../../settings/units').Unit }) => Promise<OutFile[]>;
}

export const exportFormats: ExportFormat[] = [
  { id: 'stl', label: 'STL (binary)', ext: 'stl', colors: false, build: async (parts, base) => parts.map((p) => ({ name: `${base}.stl`, data: stlBinary(p) })) },
  { id: 'stl-ascii', label: 'STL (ASCII)', ext: 'stl', colors: false, build: async (parts, base) => parts.map((p) => ({ name: `${base}.stl`, data: stlAscii(p) })) },
  {
    id: 'obj',
    label: 'OBJ + MTL',
    ext: 'obj',
    colors: true,
    build: async (parts, base, palette) => {
      const { obj, mtl } = objWithMtl(parts, base, palette);
      return [{ name: `${base}.obj`, data: obj }, { name: `${base}.mtl`, data: mtl }];
    },
  },
  { id: 'glb', label: 'GLB (binary glTF)', ext: 'glb', forceUp: 'y', colors: true, build: async (parts, base, palette) => [{ name: `${base}.glb`, data: await glb(parts, palette) }] },
  { id: 'step', label: 'STEP (solid for CAD, planar faces)', ext: 'step', colors: true, build: async (parts, base, palette, ctx) => [{ name: `${base}.step`, data: stepFile(parts, palette, ctx.units, `${base}.step`) }] },
  { id: 'scad', label: 'OpenSCAD (.scad polyhedron)', ext: 'scad', colors: true, build: async (parts, base, palette) => [{ name: `${base}.scad`, data: scadFile(parts, palette) }] },
  { id: 'ply', label: 'PLY (binary, colours)', ext: 'ply', colors: true, build: async (parts, base, palette) => [{ name: `${base}.ply`, data: plyFile(parts, palette) }] },
  { id: 'svg-laser', label: 'SVG outline (laser, top view)', ext: 'svg', forceUp: 'z', colors: false, build: async (parts, base, _p, ctx) => [{ name: `${base}.svg`, data: await laserSvg(parts, ctx.units, 'project') }] },
  { id: 'dxf-laser', label: 'DXF outline (laser / CNC, top view)', ext: 'dxf', forceUp: 'z', colors: false, build: async (parts, base, _p, ctx) => [{ name: `${base}.dxf`, data: await laserDxf(parts, 'project', ctx.units) }] },
  { id: 'svg-slice', label: 'SVG section (slice at mid-height)', ext: 'svg', forceUp: 'z', colors: false, build: async (parts, base, _p, ctx) => [{ name: `${base}.svg`, data: await laserSvg(parts, ctx.units, 'slice') }] },
  { id: 'amf', label: 'AMF (colours)', ext: 'amf', colors: true, build: async (parts, base, palette, ctx) => [{ name: `${base}.amf`, data: amfFile(parts, palette, ctx.units) }] },
];

export function registerExportFormat(f: ExportFormat, index = exportFormats.length) {
  exportFormats.splice(index, 0, f);
}
