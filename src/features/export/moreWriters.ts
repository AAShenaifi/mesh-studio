// STEP (planar-faced B-rep), OpenSCAD (polyhedron), PLY and AMF writers.
import { weld } from '../../geometry/meshOps';
import { hexToRgb255 } from '../../scene/palette';
import type { Unit } from '../../settings/units';
import { dominantColor } from '../../geometry/meshOps';
import type { ExportPart } from './writers';

const f = (v: number) => {
  // STEP REAL must contain a decimal point
  const s = String(+v.toFixed(6));
  return /[.eE]/.test(s) ? s.replace(/e/, 'E') : `${s}.`;
};
const stepStr = (s: string) => `'${s.replace(/'/g, "''").replace(/[^\x20-\x7e]/g, '_')}'`;

const STEP_UNIT: Record<Unit, string> = {
  mm: '(LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.))',
  cm: '(LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.CENTI.,.METRE.))',
  in: "(CONVERSION_BASED_UNIT('INCH',#__INCH__) LENGTH_UNIT() NAMED_UNIT(#__DIM__))",
};

/**
 * STEP AP214 with one solid (manifold B-rep) per part: coplanar triangles are
 * merged into planar faces (with holes) sharing edges, plus the part's colour. CAD programs open it as
 * a solid body; curved surfaces stay faceted (it is still a mesh).
 */
export function stepFile(parts: ExportPart[], palette: string[], unit: Unit, fileName: string): string {
  const lines: string[] = [];
  let id = 0;
  const add = (e: string) => {
    lines.push(`#${++id}=${e};`);
    return id;
  };
  const ctx = add("APPLICATION_CONTEXT('automotive design')");
  add(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,#${ctx})`);
  const pctx = add(`PRODUCT_CONTEXT('',#${ctx},'mechanical')`);
  const pdctx = add(`PRODUCT_DEFINITION_CONTEXT('part definition',#${ctx},'design')`);
  let lenUnit: number;
  if (unit === 'in') {
    const mm = add('(LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.))');
    const conv = add(`LENGTH_MEASURE_WITH_UNIT(LENGTH_MEASURE(25.4),#${mm})`);
    const dim = add('DIMENSIONAL_EXPONENTS(1.,0.,0.,0.,0.,0.,0.)');
    lenUnit = add(STEP_UNIT.in.replace('__INCH__', String(conv)).replace('__DIM__', String(dim)));
  } else lenUnit = add(STEP_UNIT[unit]);
  const ang = add('(NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.))');
  const sol = add('(NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT())');
  const unc = add(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-06),#${lenUnit},'distance_accuracy_value','')`);
  const geo = add(`(GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#${unc})) GLOBAL_UNIT_ASSIGNED_CONTEXT((#${lenUnit},#${ang},#${sol})) REPRESENTATION_CONTEXT('',''))`);
  const origin = add("CARTESIAN_POINT('',(0.,0.,0.))");
  const dz = add("DIRECTION('',(0.,0.,1.))");
  const dx = add("DIRECTION('',(1.,0.,0.))");
  const axis = add(`AXIS2_PLACEMENT_3D('',#${origin},#${dz},#${dx})`);
  const styled: number[] = [];
  parts.forEach((p) => {
    const prod = add(`PRODUCT(${stepStr(p.name)},${stepStr(p.name)},'',(#${pctx}))`);
    const form = add(`PRODUCT_DEFINITION_FORMATION('','',#${prod})`);
    const pd = add(`PRODUCT_DEFINITION('design','',#${form},#${pdctx})`);
    const pds = add(`PRODUCT_DEFINITION_SHAPE('','',#${pd})`);
    const { index, verts, count } = weld(p.positions, 1e-6);
    const P = (i: number): [number, number, number] => [verts[i * 3]!, verts[i * 3 + 1]!, verts[i * 3 + 2]!];
    const cp = (q: [number, number, number]) => add(`CARTESIAN_POINT('',(${f(q[0])},${f(q[1])},${f(q[2])}))`);
    const dir = (q: [number, number, number]) => add(`DIRECTION('',(${f(q[0])},${f(q[1])},${f(q[2])}))`);
    const vtx = new Int32Array(count).fill(-1);
    const vertex = (i: number) => {
      if (vtx[i]! < 0) vtx[i] = add(`VERTEX_POINT('',#${cp(P(i))})`);
      return vtx[i]!;
    };
    const edges = new Map<number, number>();
    /** Shared EDGE_CURVE from the lower to the higher vertex index; returns [id, same direction as a→b]. */
    const edge = (a: number, b: number): [number, boolean] => {
      const lo = Math.min(a, b), hi = Math.max(a, b);
      const key = lo * count + hi;
      let e = edges.get(key);
      if (e === undefined) {
        const pa = P(lo), pb = P(hi);
        const d: [number, number, number] = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
        const len = Math.hypot(d[0], d[1], d[2]) || 1;
        const vec = add(`VECTOR('',#${dir([d[0] / len, d[1] / len, d[2] / len])},${f(len)})`);
        const line = add(`LINE('',#${cp(pa)},#${vec})`);
        e = add(`EDGE_CURVE('',#${vertex(lo)},#${vertex(hi)},#${line},.T.)`);
        edges.set(key, e);
      }
      return [e, a === lo];
    };
    // Group coplanar neighbouring triangles into one planar face (outer boundary + holes).
    const tris = p.faceColors.length;
    const tn = new Float64Array(tris * 4); // normal + plane offset
    const valid = new Uint8Array(tris);
    for (let t = 0; t < tris; t++) {
      const a = index[t * 3]!, b = index[t * 3 + 1]!, c = index[t * 3 + 2]!;
      if (a === b || b === c || a === c) continue;
      const A = P(a), B = P(b), C = P(c);
      const nx = (B[1] - A[1]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[1] - A[1]);
      const ny = (B[2] - A[2]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[2] - A[2]);
      const nz = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
      const l = Math.hypot(nx, ny, nz);
      if (l < 1e-12) continue;
      valid[t] = 1;
      tn[t * 4] = nx / l; tn[t * 4 + 1] = ny / l; tn[t * 4 + 2] = nz / l;
      tn[t * 4 + 3] = (nx * A[0] + ny * A[1] + nz * A[2]) / l;
    }
    const ekey = (x: number, y: number) => (x < y ? x * count + y : y * count + x);
    const edgeTris = new Map<number, number[]>();
    for (let t = 0; t < tris; t++) if (valid[t]) for (let k = 0; k < 3; k++) {
      const key = ekey(index[t * 3 + k]!, index[t * 3 + ((k + 1) % 3)]!);
      const l = edgeTris.get(key);
      if (l) l.push(t); else edgeTris.set(key, [t]);
    }
    const scale = Math.max(1, ...Array.from(verts.subarray(0, Math.min(verts.length, 30000)), (v) => Math.abs(v)));
    const coplanar = (t: number, u: number) =>
      tn[t * 4]! * tn[u * 4]! + tn[t * 4 + 1]! * tn[u * 4 + 1]! + tn[t * 4 + 2]! * tn[u * 4 + 2]! > 1 - 1e-9 && Math.abs(tn[t * 4 + 3]! - tn[u * 4 + 3]!) < 1e-6 * scale;
    const group = new Int32Array(tris).fill(-1);
    const faces: number[] = [];
    for (let seed = 0; seed < tris; seed++) {
      if (!valid[seed] || group[seed] !== -1) continue;
      const members: number[] = [];
      const stack = [seed];
      group[seed] = seed;
      while (stack.length) {
        const t = stack.pop()!;
        members.push(t);
        for (let k = 0; k < 3; k++) {
          const l = edgeTris.get(ekey(index[t * 3 + k]!, index[t * 3 + ((k + 1) % 3)]!))!;
          if (l.length !== 2) continue;
          const u = l[0] === t ? l[1]! : l[0]!;
          if (group[u] === -1 && coplanar(seed, u)) { group[u] = seed; stack.push(u); }
        }
      }
      // boundary: directed edges of the group whose neighbour is outside it
      const next = new Map<number, number[]>();
      for (const t of members) for (let k = 0; k < 3; k++) {
        const x = index[t * 3 + k]!, y = index[t * 3 + ((k + 1) % 3)]!;
        const l = edgeTris.get(ekey(x, y))!;
        const inside = l.length === 2 && group[l[0] === t ? l[1]! : l[0]!] === seed;
        if (inside) continue;
        const o = next.get(x);
        if (o) o.push(y); else next.set(x, [y]);
      }
      const loops: number[][] = [];
      while (next.size) {
        const start = next.keys().next().value as number;
        const loop = [start];
        let cur = start;
        for (let guard = 0; guard < 4 * members.length + 4; guard++) {
          const outs = next.get(cur);
          if (!outs?.length) break;
          const nx = outs.pop()!;
          if (!outs.length) next.delete(cur);
          if (nx === start) break;
          loop.push(nx);
          cur = nx;
        }
        if (loop.length >= 3) loops.push(loop);
      }
      if (!loops.length) continue;
      const N: [number, number, number] = [tn[seed * 4]!, tn[seed * 4 + 1]!, tn[seed * 4 + 2]!];
      // signed area along the normal; the largest positive loop is the outer boundary
      const area = (loop: number[]) => {
        let ax = 0, ay = 0, az = 0;
        for (let i = 0; i < loop.length; i++) {
          const p0 = P(loop[i]!), p1 = P(loop[(i + 1) % loop.length]!);
          ax += p0[1] * p1[2] - p0[2] * p1[1]; ay += p0[2] * p1[0] - p0[0] * p1[2]; az += p0[0] * p1[1] - p0[1] * p1[0];
        }
        return (ax * N[0] + ay * N[1] + az * N[2]) / 2;
      };
      let outer = 0;
      for (let i = 1; i < loops.length; i++) if (area(loops[i]!) > area(loops[outer]!)) outer = i;
      const bounds = loops.map((loop, i) => {
        const oes = loop.map((x, j) => {
          const y = loop[(j + 1) % loop.length]!;
          const [e, same] = edge(x, y);
          return add(`ORIENTED_EDGE('',*,*,#${e},${same ? '.T.' : '.F.'})`);
        });
        const el = add(`EDGE_LOOP('',(${oes.map((x) => `#${x}`).join(',')}))`);
        return add(i === outer ? `FACE_OUTER_BOUND('',#${el},.T.)` : `FACE_BOUND('',#${el},.T.)`);
      });
      const A = P(loops[outer]![0]!), B = P(loops[outer]![1]!);
      const u: [number, number, number] = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
      const ul = Math.hypot(u[0], u[1], u[2]) || 1;
      const place = add(`AXIS2_PLACEMENT_3D('',#${cp(A)},#${dir(N)},#${dir([u[0] / ul, u[1] / ul, u[2] / ul])})`);
      const plane = add(`PLANE('',#${place})`);
      faces.push(add(`ADVANCED_FACE('',(${bounds.map((x) => `#${x}`).join(',')}),#${plane},.T.)`));
    }
    const shell = add(`CLOSED_SHELL('',(${faces.map((x) => `#${x}`).join(',')}))`);
    const brep = add(`MANIFOLD_SOLID_BREP(${stepStr(p.name)},#${shell})`);
    const rep = add(`ADVANCED_BREP_SHAPE_REPRESENTATION(${stepStr(p.name)},(#${axis},#${brep}),#${geo})`);
    add(`SHAPE_DEFINITION_REPRESENTATION(#${pds},#${rep})`);
    // colour of the solid (its dominant palette colour)
    const [r, g, b] = hexToRgb255(palette[dominantColor(p.faceColors)] ?? palette[0]!);
    const rgb = add(`COLOUR_RGB('',${f(r / 255)},${f(g / 255)},${f(b / 255)})`);
    const fill = add(`FILL_AREA_STYLE_COLOUR('',#${rgb})`);
    const fas = add(`FILL_AREA_STYLE('',(#${fill}))`);
    const ssfa = add(`SURFACE_STYLE_FILL_AREA(#${fas})`);
    const sss = add(`SURFACE_SIDE_STYLE('',(#${ssfa}))`);
    const ssu = add(`SURFACE_STYLE_USAGE(.BOTH.,#${sss})`);
    const psa = add(`PRESENTATION_STYLE_ASSIGNMENT((#${ssu}))`);
    styled.push(add(`STYLED_ITEM('color',(#${psa}),#${brep})`));
  });
  add(`MECHANICAL_DESIGN_GEOMETRIC_PRESENTATION_REPRESENTATION('',(${styled.map((x) => `#${x}`).join(',')}),#${geo})`);
  const now = new Date().toISOString().slice(0, 19);
  return [
    'ISO-10303-21;',
    'HEADER;',
    "FILE_DESCRIPTION(('Mesh Studio export: faceted solids'),'2;1');",
    `FILE_NAME(${stepStr(fileName)},'${now}',(''),(''),'Mesh Studio','Mesh Studio','');`,
    "FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));",
    'ENDSEC;',
    'DATA;',
    ...lines,
    'ENDSEC;',
    'END-ISO-10303-21;',
    '',
  ].join('\n');
}

/** OpenSCAD: one coloured polyhedron per part (OpenSCAD faces run clockwise seen from outside). */
export function scadFile(parts: ExportPart[], palette: string[]): string {
  const out: string[] = ['// Exported from Mesh Studio. Units: as chosen in the export dialog.', ''];
  parts.forEach((p, i) => {
    const { index, verts, count } = weld(p.positions, 1e-6);
    const [r, g, b] = hexToRgb255(palette[dominantColor(p.faceColors)] ?? palette[0]!);
    const pts: string[] = [];
    for (let v = 0; v < count; v++) pts.push(`[${+verts[v * 3]!.toFixed(5)},${+verts[v * 3 + 1]!.toFixed(5)},${+verts[v * 3 + 2]!.toFixed(5)}]`);
    const fs: string[] = [];
    for (let t = 0; t < p.faceColors.length; t++) fs.push(`[${index[t * 3]},${index[t * 3 + 2]},${index[t * 3 + 1]}]`);
    const mod = `part_${i + 1}`;
    out.push(`// ${p.name.replace(/\n/g, ' ')}`);
    out.push(`module ${mod}() polyhedron(points = [${pts.join(',')}], faces = [${fs.join(',')}], convexity = 10);`);
    out.push(`color([${(r / 255).toFixed(3)}, ${(g / 255).toFixed(3)}, ${(b / 255).toFixed(3)}]) ${mod}();`, '');
  });
  return out.join('\n');
}

/** Binary PLY with per-vertex colours (each triangle keeps its own colour). */
export function plyFile(parts: ExportPart[], palette: string[]): ArrayBuffer {
  let tris = 0;
  for (const p of parts) tris += p.faceColors.length;
  const header = `ply\nformat binary_little_endian 1.0\ncomment Mesh Studio\nelement vertex ${tris * 3}\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nelement face ${tris}\nproperty list uchar int vertex_indices\nend_header\n`;
  const head = new TextEncoder().encode(header);
  const buf = new ArrayBuffer(head.length + tris * 3 * 15 + tris * 13);
  new Uint8Array(buf).set(head);
  const dv = new DataView(buf);
  let o = head.length;
  const rgb = palette.map((c) => hexToRgb255(c));
  for (const p of parts) for (let t = 0; t < p.faceColors.length; t++) {
    const c = rgb[p.faceColors[t]!] ?? rgb[0]!;
    for (let k = 0; k < 3; k++) {
      dv.setFloat32(o, p.positions[t * 9 + k * 3]!, true); dv.setFloat32(o + 4, p.positions[t * 9 + k * 3 + 1]!, true); dv.setFloat32(o + 8, p.positions[t * 9 + k * 3 + 2]!, true);
      dv.setUint8(o + 12, c[0]); dv.setUint8(o + 13, c[1]); dv.setUint8(o + 14, c[2]);
      o += 15;
    }
  }
  for (let t = 0; t < tris; t++) {
    dv.setUint8(o, 3); dv.setInt32(o + 1, t * 3, true); dv.setInt32(o + 5, t * 3 + 1, true); dv.setInt32(o + 9, t * 3 + 2, true);
    o += 13;
  }
  return buf;
}

const AMF_UNIT: Record<Unit, string> = { mm: 'millimeter', cm: 'millimeter', in: 'inch' };

/** AMF: one object per part, one volume per colour with its material. */
export function amfFile(parts: ExportPart[], palette: string[], unit: Unit): string {
  // AMF has no centimetre unit: write millimetres (positions are already scaled to `unit`)
  const scale = unit === 'cm' ? 10 : 1;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  const used = [...new Set(parts.flatMap((p) => [...new Set(p.faceColors)]))].sort((a, b) => a - b);
  const out: string[] = ['<?xml version="1.0" encoding="UTF-8"?>', `<amf unit="${AMF_UNIT[unit]}" version="1.1">`, '<metadata type="producer">Mesh Studio</metadata>'];
  for (const c of used) {
    const [r, g, b] = hexToRgb255(palette[c] ?? palette[0]!);
    out.push(`<material id="${c + 1}"><color><r>${(r / 255).toFixed(4)}</r><g>${(g / 255).toFixed(4)}</g><b>${(b / 255).toFixed(4)}</b></color></material>`);
  }
  parts.forEach((p, i) => {
    const { index, verts, count } = weld(p.positions, 1e-6);
    out.push(`<object id="${i + 1}"><metadata type="name">${esc(p.name)}</metadata><mesh><vertices>`);
    for (let v = 0; v < count; v++) out.push(`<vertex><coordinates><x>${+(verts[v * 3]! * scale).toFixed(6)}</x><y>${+(verts[v * 3 + 1]! * scale).toFixed(6)}</y><z>${+(verts[v * 3 + 2]! * scale).toFixed(6)}</z></coordinates></vertex>`);
    out.push('</vertices>');
    for (const c of [...new Set(p.faceColors)].sort((a, b) => a - b)) {
      out.push(`<volume materialid="${c + 1}">`);
      for (let t = 0; t < p.faceColors.length; t++) if (p.faceColors[t] === c) out.push(`<triangle><v1>${index[t * 3]}</v1><v2>${index[t * 3 + 1]}</v2><v3>${index[t * 3 + 2]}</v3></triangle>`);
      out.push('</volume>');
    }
    out.push('</mesh></object>');
  });
  out.push('</amf>');
  return out.join('\n');
}
