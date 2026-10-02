// Generates test models into a temp folder (nothing binary is committed).
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const FIX = join(tmpdir(), 'mesh-studio-fixtures');

function boxTris(mn, sz) {
  const v = [];
  for (const x of [0, 1]) for (const y of [0, 1]) for (const z of [0, 1]) v.push([mn[0] + sz[0] * x, mn[1] + sz[1] * y, mn[2] + sz[2] * z]);
  const i = (x, y, z) => x * 4 + y * 2 + z;
  const quads = [
    [i(0,0,0), i(0,1,0), i(1,1,0), i(1,0,0)], [i(0,0,1), i(1,0,1), i(1,1,1), i(0,1,1)],
    [i(0,0,0), i(1,0,0), i(1,0,1), i(0,0,1)], [i(0,1,0), i(0,1,1), i(1,1,1), i(1,1,0)],
    [i(0,0,0), i(0,0,1), i(0,1,1), i(0,1,0)], [i(1,0,0), i(1,1,0), i(1,1,1), i(1,0,1)],
  ];
  const tris = quads.flatMap(([a, b, c, d]) => [[a, b, c], [a, c, d]]);
  return { v, tris };
}

export function stlBinary(tris3) {
  const buf = Buffer.alloc(84 + tris3.length * 50);
  buf.write('fixture', 0);
  buf.writeUInt32LE(tris3.length, 80);
  tris3.forEach((t, k) => {
    const o = 84 + k * 50 + 12;
    t.flat().forEach((f, j) => buf.writeFloatLE(f, o + j * 4));
  });
  return buf;
}

/** UV sphere-ish closed mesh (watertight), for a curved test model. */
function cylinderTris(r, h, n) {
  const tris = [];
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
    const p0 = [r * Math.cos(a0), r * Math.sin(a0)], p1 = [r * Math.cos(a1), r * Math.sin(a1)];
    tris.push([[0, 0, 0], [p1[0], p1[1], 0], [p0[0], p0[1], 0]]);
    tris.push([[0, 0, h], [p0[0], p0[1], h], [p1[0], p1[1], h]]);
    tris.push([[p0[0], p0[1], 0], [p1[0], p1[1], 0], [p1[0], p1[1], h]]);
    tris.push([[p0[0], p0[1], 0], [p1[0], p1[1], h], [p0[0], p0[1], h]]);
  }
  return tris;
}

export function makeFixtures() {
  mkdirSync(FIX, { recursive: true });
  const { v, tris } = boxTris([100, 50, -7], [20, 30, 40]);
  const box3 = tris.map((t) => t.map((k) => v[k]));
  writeFileSync(join(FIX, 'box.stl'), stlBinary(box3));
  writeFileSync(join(FIX, 'box_ascii.stl'),
    'solid box\n' + box3.map((t) => ' facet normal 0 0 0\n  outer loop\n' + t.map((p) => `   vertex ${p.join(' ')}\n`).join('') + '  endloop\n endfacet\n').join('') + 'endsolid box\n');
  writeFileSync(join(FIX, 'box.obj'), v.map((p) => `v ${p.join(' ')}`).join('\n') + '\n' + tris.map((t) => `f ${t.map((k) => k + 1).join(' ')}`).join('\n') + '\n');
  // glTF (Y-up) with the same data
  const pos = Buffer.alloc(v.length * 12); v.flat().forEach((f, j) => pos.writeFloatLE(f, j * 4));
  const idx = Buffer.alloc(tris.length * 6); tris.flat().forEach((k, j) => idx.writeUInt16LE(k, j * 2));
  const bin = Buffer.concat([pos, idx]);
  const gltf = (uri, color) => ({
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, ...(color ? { material: 0 } : {}) }] }],
    ...(color ? { materials: [{ pbrMetallicRoughness: { baseColorFactor: color } }] } : {}),
    buffers: [{ byteLength: bin.length, ...(uri ? { uri } : {}) }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: pos.length }, { buffer: 0, byteOffset: pos.length, byteLength: idx.length }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 8, type: 'VEC3', min: [100, 50, -7], max: [120, 80, 33] },
      { bufferView: 1, componentType: 5123, count: tris.length * 3, type: 'SCALAR' },
    ],
  });
  writeFileSync(join(FIX, 'box.gltf'), JSON.stringify(gltf('box.bin')));
  writeFileSync(join(FIX, 'box.bin'), bin);
  const glb = (doc) => {
    let j = Buffer.from(JSON.stringify(doc)); j = Buffer.concat([j, Buffer.alloc((4 - (j.length % 4)) % 4, 0x20)]);
    const b = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
    const head = Buffer.alloc(12); head.write('glTF', 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + j.length + 8 + b.length, 8);
    const jh = Buffer.alloc(8); jh.writeUInt32LE(j.length, 0); jh.write('JSON', 4);
    const bh = Buffer.alloc(8); bh.writeUInt32LE(b.length, 0); bh.write('BIN\0', 4);
    return Buffer.concat([head, jh, j, bh, b]);
  };
  writeFileSync(join(FIX, 'box.glb'), glb(gltf(null)));
  writeFileSync(join(FIX, 'red_box.glb'), glb(gltf(null, [1, 0, 0, 1])));
  writeFileSync(join(FIX, 'cylinder.stl'), stlBinary(cylinderTris(10, 30, 48)));
  // open box: top face missing (2 triangles) → has a hole
  writeFileSync(join(FIX, 'open_box.stl'), stlBinary(box3.filter((_, k) => k !== 2 && k !== 3)));
  writeFileSync(join(FIX, 'notes.txt'), 'hello');
  writeFileSync(join(FIX, 'broken.glb'), 'glTF garbage');
  writeFileSync(join(FIX, 'empty.stl'), '');
  return FIX;
}

// ---------------------------------------------------------------- Phase 6 fixtures
import { deflateSync } from 'node:zlib';
import { createRequire } from 'node:module';
const requireApp = createRequire(new URL('../../package.json', import.meta.url));

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
/** Minimal RGBA PNG encoder. */
export function png(w, h, pixel) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = pixel(x, y);
      raw.set([r, g, b, a], y * (w * 4 + 1) + 1 + x * 4);
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

export async function makePhase6Fixtures() {
  // ring: black annulus on white, 120 x 80 px
  writeFileSync(join(FIX, 'ring.png'), png(120, 80, (x, y) => {
    const d = Math.hypot(x - 60, y - 40);
    return d < 35 && d > 18 ? [0, 0, 0, 255] : [255, 255, 255, 255];
  }));
  // gradient for relief
  writeFileSync(join(FIX, 'gradient.png'), png(64, 32, (x) => { const v = Math.round((x / 63) * 255); return [v, v, v, 255]; }));
  // SVG: 100 x 50 rectangle with a square hole (evenodd) + separate circle; stroke-only line
  writeFileSync(join(FIX, 'shapes.svg'), `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">
  <path fill="#000" fill-rule="evenodd" d="M0 0 H100 V50 H0 Z M25 10 H75 V40 H25 Z"/>
  <circle cx="150" cy="25" r="20" fill="#000"/>
</svg>`);
  writeFileSync(join(FIX, 'line.svg'), `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="20"><path d="M10 10 L90 10" stroke="#000" stroke-width="6" fill="none"/></svg>`);
  // third-party style 3MF: unit cm, colorgroup, a component object with transforms, build transform
  const JSZip = requireApp('jszip');
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="r0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>');
  const { v, tris } = boxTris([0, 0, 0], [1, 2, 3]); // 1 x 2 x 3 cm
  const verts = v.map(([x, y, z]) => `<vertex x="${x}" y="${y}" z="${z}"/>`).join('');
  const triXml = tris.map(([a, b, c], i) => `<triangle v1="${a}" v2="${b}" v3="${c}"${i < 2 ? ' pid="5" p1="1"' : ''}/>`).join('');
  zip.file('3D/3dmodel.model', `<?xml version="1.0" encoding="UTF-8"?>
<model unit="centimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02">
 <resources>
  <m:colorgroup id="5"><m:color color="#FFFFFFFF"/><m:color color="#00FF00FF"/></m:colorgroup>
  <object id="1" type="model" name="brick" pid="5" pindex="0"><mesh><vertices>${verts}</vertices><triangles>${triXml}</triangles></mesh></object>
  <object id="2" type="model" name="pair"><components>
   <component objectid="1"/>
   <component objectid="1" transform="1 0 0 0 1 0 0 0 1 5 0 0"/>
  </components></object>
 </resources>
 <build><item objectid="2" transform="0 1 0 -1 0 0 0 0 1 0 0 0"/></build>
</model>`);
  writeFileSync(join(FIX, 'thirdparty.3mf'), await zip.generateAsync({ type: 'nodebuffer' }));
}

export async function makeStepFixtures() {
  const { stepBox, stepCylinder, stepTwoBoxes } = await import('./stepFixture.mjs');
  writeFileSync(join(FIX, 'red_box.step'), stepBox([20, 30, 40], [1, 0, 0], 'RedBox'));
  writeFileSync(join(FIX, 'cylinder.stp'), stepCylinder(10, 30, [0, 0, 1]));
  writeFileSync(join(FIX, 'pair.step'), stepTwoBoxes());
  writeFileSync(join(FIX, 'broken.step'), 'ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\n#1=GARBAGE(;\nENDSEC;\nEND-ISO-10303-21;\n');
}

/** ~1M-triangle closed UV sphere (radius 50 mm) as binary STL (≈50 MB, temp folder only). */
export function makeBigSphere(targetTris = 1_000_000) {
  const path = join(FIX, 'sphere_1m.stl');
  const segs = Math.ceil(Math.sqrt(targetTris / 2));
  const rings = segs;
  const n = 2 * segs * (rings - 1);
  const buf = Buffer.alloc(84 + n * 50);
  buf.writeUInt32LE(n, 80);
  const P = (i, j) => {
    const th = (i / rings) * Math.PI, ph = (j / segs) * Math.PI * 2;
    return [50 * Math.sin(th) * Math.cos(ph), 50 * Math.sin(th) * Math.sin(ph), 50 + 50 * Math.cos(th)];
  };
  let t = 0;
  const put = (a, b, c) => {
    const o = 84 + t * 50 + 12;
    [a, b, c].flat().forEach((v, k) => buf.writeFloatLE(v, o + k * 4));
    t++;
  };
  for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) {
    const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
    if (i !== 0) put(a, b, d);
    if (i !== rings - 1) put(b, c, d);
  }
  buf.writeUInt32LE(t, 80);
  writeFileSync(path, buf.subarray(0, 84 + t * 50));
  return { path, tris: t };
}

export function makeImageFixtures() {
  // two colours on white: red disc left, blue square right (for Textures)
  writeFileSync(join(FIX, 'two_colours.png'), png(160, 80, (x, y) => {
    if (Math.hypot(x - 40, y - 40) < 28) return [220, 30, 30, 255];
    if (x > 95 && x < 145 && y > 15 && y < 65) return [30, 60, 220, 255];
    return [255, 255, 255, 255];
  }));
  // large image (3000 x 2000): dark ellipse
  writeFileSync(join(FIX, 'large.png'), png(3000, 2000, (x, y) => (((x - 1500) / 1200) ** 2 + ((y - 1000) / 800) ** 2 < 1 ? [0, 0, 0, 255] : [255, 255, 255, 255])));
}

/** Painted 3MF files as Bambu Studio and PrusaSlicer write them (box, 12 triangles). */
export async function makePaintedFixtures() {
  mkdirSync(FIX, { recursive: true });
  const JSZip = requireApp('jszip');
  const { v, tris } = boxTris([0, 0, 0], [20, 20, 20]);
  const verts = v.map(([x, y, z]) => `<vertex x="${x}" y="${y}" z="${z}"/>`).join('');
  const rels = '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="r0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>';
  const types = '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>';
  // Bambu: production extension (mesh in 3D/Objects), paint_color codes, filament colours in project_settings, object extruder 2.
  // Triangles 0-1 filament 1 ("4"), 2-3 filament 3 ("0C"), 4 split 3 ways: 3 × filament 1 + 1 × filament 2 ("84443"), rest unpainted.
  const codes = ['4', '4', '0C', '0C', '84443'];
  const bz = new JSZip();
  bz.file('[Content_Types].xml', types);
  bz.file('_rels/.rels', rels);
  bz.file('3D/Objects/object_1.model', `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources>
 <object id="1" type="model"><mesh><vertices>${verts}</vertices><triangles>${tris.map(([a, b, c], i) => `<triangle v1="${a}" v2="${b}" v3="${c}"${codes[i] ? ` paint_color="${codes[i]}"` : ''}/>`).join('')}</triangles></mesh></object>
</resources><build/></model>`);
  bz.file('3D/3dmodel.model', `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06">
 <metadata name="Application">BambuStudio-02.00.00.00</metadata>
 <resources><object id="2" type="model" name="painted_box"><components><component p:path="/3D/Objects/object_1.model" objectid="1" transform="1 0 0 0 1 0 0 0 1 0 0 0"/></components></object></resources>
 <build><item objectid="2" transform="1 0 0 0 1 0 0 0 1 100 100 10"/></build>
</model>`);
  bz.file('Metadata/project_settings.config', JSON.stringify({ filament_colour: ['#FF0000', '#00FF00', '#0000FF'], printer_model: 'test' }));
  bz.file('Metadata/model_settings.config', '<?xml version="1.0" encoding="UTF-8"?>\n<config>\n  <object id="2">\n    <metadata key="name" value="painted_box"/>\n    <metadata key="extruder" value="2"/>\n  </object>\n</config>\n');
  writeFileSync(join(FIX, 'bambu_painted.3mf'), await bz.generateAsync({ type: 'nodebuffer' }));
  // PrusaSlicer: single model file, slic3rpe:mmu_segmentation, extruder colours in Slic3r_PE.config.
  const pz = new JSZip();
  pz.file('[Content_Types].xml', types);
  pz.file('_rels/.rels', rels);
  pz.file('3D/3dmodel.model', `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:slic3rpe="http://schemas.slic3r.org/3mf/2017/06">
 <metadata name="slic3rpe:Version3mf">1</metadata><metadata name="slic3rpe:MmPaintingVersion">1</metadata>
 <resources><object id="1" type="model"><mesh><vertices>${verts}</vertices><triangles>${tris.map(([a, b, c], i) => `<triangle v1="${a}" v2="${b}" v3="${c}"${i < 6 ? ' slic3rpe:mmu_segmentation="8"' : ''}/>`).join('')}</triangles></mesh></object></resources>
 <build><item objectid="1"/></build>
</model>`);
  pz.file('Metadata/Slic3r_PE.config', '; generated by PrusaSlicer 2.8.0\n\n; extruder_colour = "#FFFF00";"#00FFFF"\n; filament_colour = "#FF8000";"#FF8000"\n');
  writeFileSync(join(FIX, 'prusa_painted.3mf'), await pz.generateAsync({ type: 'nodebuffer' }));
}
