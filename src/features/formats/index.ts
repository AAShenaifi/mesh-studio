import { registerLoader } from '../../loaders/openFiles';
import { registerPanel } from '../../ui/panels';
import { registerExportFormat } from '../export/formats';
import { build3mf, load3mf } from './threemf';
import { extrudeSvgFile } from './extrude';
import { ExtrudePanel } from './ExtrudePanel';
import { loadAmf, loadPly, loadVrml } from './plyAmf';

registerLoader('3mf', (file, _all, existing) => load3mf(file, existing));
registerLoader('ply', (file, _all, existing) => loadPly(file, existing));
registerLoader('amf', (file, _all, existing) => loadAmf(file, existing));
registerLoader('wrl', (file, _all, existing) => loadVrml(file, existing));
registerLoader('vrml', (file, _all, existing) => loadVrml(file, existing));
registerLoader('svg', (file, _all, existing) => extrudeSvgFile(file, existing));

registerExportFormat(
  {
    id: '3mf',
    label: '3MF for Bambu Studio / PrusaSlicer (painted)',
    ext: '3mf',
    forceUp: 'z',
    colors: true,
    filamentSlots: true,
    build: async (parts, base, palette, ctx) => [{ name: `${base}.3mf`, data: await build3mf(parts, palette, ctx.units, 'slicer') }],
  },
  0,
);
registerExportFormat(
  { id: '3mf-std', label: '3MF (standard colours)', ext: '3mf', forceUp: 'z', colors: true, build: async (parts, base, palette, ctx) => [{ name: `${base}.3mf`, data: await build3mf(parts, palette, ctx.units, 'standard') }] },
  1,
);

registerPanel({ tab: 'create', title: 'Extrude SVG', order: 10, Component: ExtrudePanel });

