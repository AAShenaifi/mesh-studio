// Gap features, batch 6: PLY / AMF import, paint by height, wall thickness, slab cuts,
// cut by a drawn line, licence note.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch, ok, pick, sceneState, objectSize, reset, shot, finish, settle, errorText, FIX } from './harness.mjs';
import { makeFixtures } from './fixtures.mjs';

makeFixtures();
// 20 mm cube as PLY (ASCII, per-vertex colour: top 4 vertices red) and AMF (two materials)
const V = [[0, 0, 0], [20, 0, 0], [20, 20, 0], [0, 20, 0], [0, 0, 20], [20, 0, 20], [20, 20, 20], [0, 20, 20]];
const F = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
writeFileSync(join(FIX, 'cube.ply'), ['ply', 'format ascii 1.0', 'element vertex 8', 'property float x', 'property float y', 'property float z', 'property uchar red', 'property uchar green', 'property uchar blue', 'element face 12', 'property list uchar int vertex_indices', 'end_header',
  ...V.map((v) => `${v.join(' ')} ${v[2] > 10 ? '255 0 0' : '255 255 255'}`), ...F.map((f) => `3 ${f.join(' ')}`)].join('\n') + '\n');
writeFileSync(join(FIX, 'cube.amf'), `<?xml version="1.0" encoding="UTF-8"?>
<amf unit="millimeter"><material id="2"><color><r>0</r><g>0</g><b>1</b></color></material>
<object id="1"><mesh><vertices>${V.map((v) => `<vertex><coordinates><x>${v[0]}</x><y>${v[1]}</y><z>${v[2]}</z></coordinates></vertex>`).join('')}</vertices>
<volume>${F.slice(0, 6).map((f) => `<triangle><v1>${f[0]}</v1><v2>${f[1]}</v2><v3>${f[2]}</v3></triangle>`).join('')}</volume>
<volume materialid="2">${F.slice(6).map((f) => `<triangle><v1>${f[0]}</v1><v2>${f[1]}</v2><v3>${f[2]}</v3></triangle>`).join('')}</volume>
</mesh></object></amf>`);

const BASE_URL = process.argv[2] || 'http://localhost:5173/';
const { browser, page, problems } = await launch(BASE_URL);
const analyze = (idx = -1) => page.evaluate(async (idx) => window.__meshStudio.analyze(window.__meshStudio.scene.getState().objects.at(idx)), idx);
const prim = async (kind, size) => { await page.evaluate(({ kind, size }) => window.__meshStudio.tools.addPrimitive(kind, size, 64, 0), { kind, size }); await settle(page); };
const setNum = async (sel, v) => { await page.locator(sel).fill(String(v)); await page.locator(sel).press('Enter'); };
const colours = (idx = 0) => page.evaluate((idx) => { const s = window.__meshStudio.scene.getState(); return [...s.objects.at(idx).faceColors].map((c) => s.palette[c]); }, idx);

// ---------- PLY / AMF ----------
await pick(page, ['cube.ply']);
let st = await sceneState(page);
let c = await colours();
ok(st.objects.length === 1 && st.objects[0].tris === 12 && near3(await objectSize(page), [20, 20, 20]), 'PLY cube loads (12 triangles, 20 mm)');
ok(c[2] === '#ff0000' && c[3] === '#ff0000' && c[0] === '#b58fd0' && c[1] === '#b58fd0', 'PLY vertex colours: top face red, bottom face default (mixed sides blend)');
await reset(page);
await pick(page, ['cube.amf']);
st = await sceneState(page);
c = await colours();
ok(st.objects.length === 1 && st.objects[0].tris === 12 && (await analyze()).manifold, 'AMF cube loads watertight');
ok(c.filter((x) => x === '#0000ff').length === 6, 'AMF material colour on its volume (6 blue triangles)');
function near3(a, b, e = 0.01) { return a.every((v, i) => Math.abs(v - b[i]) <= e); }

// ---------- paint by height range ----------
await reset(page);
await prim('box', [20, 20, 20]);
await page.getByRole('tab', { name: 'Paint' }).click();
await page.getByRole('radio', { name: /Colour 4 / }).click();
await setNum('#pt-z0', 0); await setNum('#pt-z1', 7);
await page.getByRole('button', { name: 'Paint height range' }).click();
c = await colours();
ok(c.filter((x) => x === '#ef6b73').length === 2 + 4, `height 0–7 mm paints the bottom (2) and the low side triangles (4): ${c.filter((x) => x === '#ef6b73').length}`);
await page.keyboard.press('Control+z');
ok((await colours()).every((x) => x === '#b58fd0'), 'undo height painting');

// ---------- wall thickness ----------
await reset(page);
await prim('box', [30, 30, 30]);
await page.getByRole('tab', { name: 'Edit' }).click();
await setNum('#th-limit', 2);
await page.getByRole('button', { name: 'Check wall thickness' }).click();
await page.waitForSelector('[data-testid=th-min]');
ok(/30\.00 mm/.test(await page.locator('[data-testid=th-min]').innerText()) && /0\.00 cm²/.test(await page.locator('[data-testid=th-area]').innerText()), 'solid 30 mm cube: thinnest wall 30 mm, no thin area');
await page.evaluate(() => window.__meshStudio.app.getState().setPanelOpen('Hollow', true));
await page.locator('#ho-t').fill('1').catch(() => {});
await page.locator('#ho-t').press('Enter').catch(() => {});
await page.locator('[data-panel="Hollow"]').getByRole('button', { name: /^Hollow/ }).click();
await settle(page);
await page.getByRole('button', { name: 'Check wall thickness' }).click();
await page.waitForSelector('[data-testid=th-min]');
const thinMin = parseFloat(await page.locator('[data-testid=th-min]').innerText());
const thinArea = parseFloat(await page.locator('[data-testid=th-area]').innerText());
ok(thinMin > 0.5 && thinMin < 2 && thinArea > 50, `hollowed cube: thinnest wall ${thinMin} mm, ${thinArea} cm² below 2 mm (shown in red)`);
await shot(page, 'p15-thickness');

// ---------- slabs ----------
await reset(page);
await prim('box', [20, 20, 40]);
await page.getByRole('button', { name: /Start cut/ }).click();
await setNum('#cut-slabs', 4);
await page.getByRole('button', { name: 'Cut', exact: true }).click();
await settle(page);
st = await sceneState(page);
const sizes = [];
for (let i = 0; i < st.objects.length; i++) sizes.push(await objectSize(page, i));
const allOk = (await Promise.all(st.objects.map((_, i) => analyze(i)))).every((a) => a.manifold && Math.abs(Math.abs(a.volume) - 4000) < 0.5);
ok(st.objects.length === 4 && sizes.every((s) => Math.abs(s[2] - 10) < 0.01) && allOk, 'slabs: 4 watertight 10 mm slices of 4000 mm³');

// ---------- cut by a drawn line ----------
await reset(page);
await prim('box', [40, 20, 20]);
await page.getByRole('button', { name: /Start cut/ }).click();
await setNum('#cut-slabs', 1);
await page.evaluate(() => window.__meshStudio.app.getState().requestCamera('front', 'selection'));
await page.waitForTimeout(400);
await page.getByRole('button', { name: 'Draw the cut line on screen' }).click();
const cb = await page.locator('[data-testid=viewport] canvas').boundingBox();
const x0 = cb.x + cb.width / 2 + 80, y0 = cb.y + cb.height / 2;
await page.mouse.move(x0, y0 - 200);
await page.mouse.down();
await page.mouse.move(x0, y0 + 200, { steps: 6 });
ok((await page.locator('[data-testid=cut-line]').count()) === 1, 'a dashed line follows the drag');
await page.mouse.up();
const plane = await page.evaluate(() => { const c = window.__meshStudio.cut.getState(); return { q: c.quaternion, p: c.position, drawing: c.drawing }; });
const n = await page.evaluate((q) => { const [x, y, z, w] = q; return [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)]; }, plane.q);
ok(!plane.drawing && Math.abs(Math.abs(n[0]) - 1) < 0.02, `a vertical line in the front view gives a plane facing X (normal ${n.map((v) => v.toFixed(2)).join(', ')})`);
await page.getByRole('button', { name: 'Cut', exact: true }).click();
await settle(page);
st = await sceneState(page);
const w = [(await objectSize(page, 0))[0], (await objectSize(page, 1))[0]].sort((a, b) => a - b);
const vols = [Math.abs((await analyze(0)).volume), Math.abs((await analyze(1)).volume)];
ok(st.objects.length === 2 && w[0] < 18 && w[1] > 22 && Math.abs(vols[0] + vols[1] - 16000) < 0.5, `cut right of centre, where the line was drawn (widths ${w.join(' / ')}, volumes add up to 16000)`);
await shot(page, 'p15-drawn-cut');

// ---------- licence note ----------
await page.getByRole('button', { name: /Settings/ }).first().click();
const note = await page.locator('[data-testid=licence-note]').innerText();
ok(/AGPL-3\.0/.test(note) && (await page.locator('[data-testid=licence-note] a').getAttribute('href')).includes('github.com/AAShenaifi/mesh-studio'), 'Settings shows the AGPL note with a source link');
await page.keyboard.press('Escape');
ok(!(await errorText(page)), 'no error banner');

await finish(browser, problems);
