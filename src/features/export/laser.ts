// Laser / CNC output: 2D outlines (top view or a horizontal slice) as SVG or DXF.
import { kernel } from '../../geometry/kernel';
import type { ExportPart } from './writers';

type Poly = Array<[number, number]>;

async function outlines(parts: ExportPart[], mode: 'project' | 'slice'): Promise<Poly[][]> {
  const meshes = parts.map((p) => ({ positions: p.positions.slice(), faceColors: p.faceColors.slice() }));
  const r = await kernel<{ outlines: Poly[][] }>('outline', { meshes, mode, z: 0 });
  if (!r.outlines.some((o) => o.length)) throw new Error('No closed outline found. Laser export needs watertight objects.');
  return r.outlines;
}

function bounds(all: Poly[][]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const part of all) for (const poly of part) for (const [x, y] of poly) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}

const n = (v: number) => String(+v.toFixed(4));

/** SVG in real units (1 user unit = 1 export unit), red hairline cut paths, Y flipped so it reads like the top view. */
export async function laserSvg(parts: ExportPart[], unit: string, mode: 'project' | 'slice'): Promise<string> {
  const all = await outlines(parts, mode);
  const b = bounds(all);
  const w = b.x1 - b.x0, h = b.y1 - b.y0;
  const paths = all.map((part, i) => `<path id="${parts[i]!.name.replace(/[^\w-]+/g, '_')}" d="${part.map((poly) => 'M' + poly.map(([x, y]) => `${n(x - b.x0)} ${n(b.y1 - y)}`).join(' L') + ' Z').join(' ')}"/>`);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(w)}${unit}" height="${n(h)}${unit}" viewBox="0 0 ${n(w)} ${n(h)}">`,
    `<g fill="none" stroke="#ff0000" stroke-width="0.1" fill-rule="evenodd">`,
    ...paths,
    '</g>',
    '</svg>',
    '',
  ].join('\n');
}

/** DXF (R12 ASCII, closed POLYLINE entities, one layer per part). */
export async function laserDxf(parts: ExportPart[], mode: 'project' | 'slice', unit: 'mm' | 'cm' | 'in'): Promise<string> {
  const all = await outlines(parts, mode);
  const out: string[] = ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', unit === 'in' ? '1' : unit === 'cm' ? '5' : '4', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES'];
  all.forEach((part, i) => {
    const layer = (parts[i]!.name || `part${i + 1}`).replace(/[^\w-]+/g, '_').slice(0, 30) || `part${i + 1}`;
    for (const poly of part) {
      out.push('0', 'POLYLINE', '8', layer, '66', '1', '70', '1');
      for (const [x, y] of poly) out.push('0', 'VERTEX', '8', layer, '10', n(x), '20', n(y));
      out.push('0', 'SEQEND');
    }
  });
  out.push('0', 'ENDSEC', '0', 'EOF', '');
  return out.join('\n');
}
