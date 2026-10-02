// Writes a valid STEP AP214 box (B-rep with product structure, mm units, optional colour).
function context(name) {
  let id = 0;
  const lines = [];
  const e = (s) => { id++; lines.push(`#${id}=${s};`); return `#${id}`; };
  const f = (v) => (Number.isInteger(v) ? v.toFixed(1) : String(v)).replace(/^(-?\d+)\.0$/, '$1.');
  const app = e(`APPLICATION_CONTEXT('automotive design')`);
  e(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,${app})`);
  const pctx = e(`PRODUCT_CONTEXT('',${app},'mechanical')`);
  const prod = e(`PRODUCT('${name}','${name}','',(${pctx}))`);
  const pdf = e(`PRODUCT_DEFINITION_FORMATION('','',${prod})`);
  const pdc = e(`PRODUCT_DEFINITION_CONTEXT('part definition',${app},'design')`);
  const pd = e(`PRODUCT_DEFINITION('design','',${pdf},${pdc})`);
  const pds = e(`PRODUCT_DEFINITION_SHAPE('','',${pd})`);
  const mm = e(`( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) )`);
  const rad = e(`( NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.) )`);
  const sr = e(`( NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT() )`);
  const unc = e(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-07),${mm},'distance_accuracy_value','')`);
  const ctx = e(`( GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((${unc})) GLOBAL_UNIT_ASSIGNED_CONTEXT((${mm},${rad},${sr})) REPRESENTATION_CONTEXT('',''))`);
  const cp = (p) => e(`CARTESIAN_POINT('',(${p.map(f).join(',')}))`);
  const dir = (d) => e(`DIRECTION('',(${d.map(f).join(',')}))`);
  const finish = (brepOrList, color) => {
    const breps = Array.isArray(brepOrList) ? brepOrList : [brepOrList];
    const brep = breps[0];
    const origin = e(`AXIS2_PLACEMENT_3D('',${cp([0, 0, 0])},${dir([0, 0, 1])},${dir([1, 0, 0])})`);
    const rep = e(`ADVANCED_BREP_SHAPE_REPRESENTATION('',(${breps.join(',')},${origin}),${ctx})`);
    e(`SHAPE_DEFINITION_REPRESENTATION(${pds},${rep})`);
    if (color) {
      const c = e(`COLOUR_RGB('',${color.map(f).join(',')})`);
      const fill = e(`SURFACE_STYLE_FILL_AREA(${e(`FILL_AREA_STYLE('',(${e(`FILL_AREA_STYLE_COLOUR('',${c})`)}))`)})`);
      const usage = e(`SURFACE_STYLE_USAGE(.BOTH.,${e(`SURFACE_SIDE_STYLE('',(${fill}))`)})`);
      const styled = e(`STYLED_ITEM('color',(${e(`PRESENTATION_STYLE_ASSIGNMENT((${usage}))`)}),${brep})`);
      e(`MECHANICAL_DESIGN_GEOMETRIC_PRESENTATION_REPRESENTATION('',(${styled}),${ctx})`);
    }
    return `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('Mesh Studio test part'),'2;1');
FILE_NAME('part.step','2026-10-01T00:00:00',(''),(''),'','','');
FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));
ENDSEC;
DATA;
${lines.join('\n')}
ENDSEC;
END-ISO-10303-21;
`;
  };
  return { e, f, cp, dir, finish };
}

function boxBrep({ e, cp, dir }, [sx, sy, sz], name, [ox, oy, oz] = [0, 0, 0]) {
  const P = [];
  for (let i = 0; i < 8; i++) P.push([ox + (i & 1) * sx, oy + ((i >> 1) & 1) * sy, oz + ((i >> 2) & 1) * sz]);
  const V = P.map((p) => e(`VERTEX_POINT('',${cp(p)})`));
  const pairs = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const E = pairs.map(([a, b]) => {
    const d = P[b].map((v, k) => v - P[a][k]);
    const len = Math.hypot(...d);
    const line = e(`LINE('',${cp(P[a])},${e(`VECTOR('',${dir(d.map((x) => x / len))},1.)`)})`);
    return { a, b, id: e(`EDGE_CURVE('',${V[a]},${V[b]},${line},.T.)`) };
  });
  const faces = [
    [[0, 2, 3, 1], [0, 0, -1]], [[4, 5, 7, 6], [0, 0, 1]],
    [[0, 1, 5, 4], [0, -1, 0]], [[2, 6, 7, 3], [0, 1, 0]],
    [[0, 4, 6, 2], [-1, 0, 0]], [[1, 3, 7, 5], [1, 0, 0]],
  ];
  const F = faces.map(([loop, n]) => {
    const oes = loop.map((a, i) => {
      const b = loop[(i + 1) % 4];
      const edge = E.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
      return e(`ORIENTED_EDGE('',*,*,${edge.id},${edge.a === a ? '.T.' : '.F.'})`);
    });
    const bound = e(`FACE_OUTER_BOUND('',${e(`EDGE_LOOP('',(${oes.join(',')}))`)},.T.)`);
    const ref = Math.abs(n[0]) > 0.5 ? [0, 1, 0] : [1, 0, 0];
    const plane = e(`PLANE('',${e(`AXIS2_PLACEMENT_3D('',${cp(P[loop[0]])},${dir(n)},${dir(ref)})`)})`);
    return e(`ADVANCED_FACE('',(${bound}),${plane},.T.)`);
  });
  return e(`MANIFOLD_SOLID_BREP('${name}',${e(`CLOSED_SHELL('',(${F.join(',')}))`)})`);
}

export function stepBox(size, color = null, name = 'Box') {
  const c = context(name);
  return c.finish(boxBrep(c, size, name), color);
}

/** Two separate solids in one file (an assembly-like STEP). */
export function stepTwoBoxes() {
  const c = context('Pair');
  return c.finish([boxBrep(c, [10, 10, 10], 'Left'), boxBrep(c, [10, 10, 20], 'Right', [30, 0, 5])], null);
}

/** Closed cylinder (radius r, height h) standing on z = 0: side face with a seam edge plus two caps. */
export function stepCylinder(r, h, color = null, name = 'Cylinder') {
  const { e, cp, dir, finish } = context(name);
  const v0 = e(`VERTEX_POINT('',${cp([r, 0, 0])})`);
  const v1 = e(`VERTEX_POINT('',${cp([r, 0, h])})`);
  const ax = (z) => e(`AXIS2_PLACEMENT_3D('',${cp([0, 0, z])},${dir([0, 0, 1])},${dir([1, 0, 0])})`);
  const c0 = e(`EDGE_CURVE('',${v0},${v0},${e(`CIRCLE('',${ax(0)},${r})`)},.T.)`);
  const c1 = e(`EDGE_CURVE('',${v1},${v1},${e(`CIRCLE('',${ax(h)},${r})`)},.T.)`);
  const seam = e(`EDGE_CURVE('',${v0},${v1},${e(`LINE('',${cp([r, 0, 0])},${e(`VECTOR('',${dir([0, 0, 1])},1.)`)})`)},.T.)`);
  const oe = (edge, sense) => e(`ORIENTED_EDGE('',*,*,${edge},${sense})`);
  const face = (loop, surface) => e(`ADVANCED_FACE('',(${e(`FACE_OUTER_BOUND('',${e(`EDGE_LOOP('',(${loop.join(',')}))`)},.T.)`)}),${surface},.T.)`);
  const bottom = face([oe(c0, '.F.')], e(`PLANE('',${e(`AXIS2_PLACEMENT_3D('',${cp([0, 0, 0])},${dir([0, 0, -1])},${dir([1, 0, 0])})`)})`));
  const top = face([oe(c1, '.T.')], e(`PLANE('',${ax(h)})`));
  const side = face([oe(c0, '.T.'), oe(seam, '.T.'), oe(c1, '.F.'), oe(seam, '.F.')], e(`CYLINDRICAL_SURFACE('',${ax(0)},${r})`));
  return finish(e(`MANIFOLD_SOLID_BREP('${name}',${e(`CLOSED_SHELL('',(${bottom},${top},${side}))`)})`), color);
}
