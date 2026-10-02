// Patterns (linear / grid / circular), object snapping while moving, adjustable
// snap steps, measure snap settings, face-to-face measure, STEP / SCAD / PLY / AMF export.
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { launch, ok, pick, sceneState, objectSize, reset, shot, finish, settle } from './harness.mjs';

const BASE_URL = process.argv[2] || 'http://localhost:5173/';
const { browser, page, problems } = await launch(BASE_URL);
const DL = join(tmpdir(), 'mesh-studio-downloads');
mkdirSync(DL, { recursive: true });
const analyze = (idx = -1) => page.evaluate(async (idx) => window.__meshStudio.analyze(window.__meshStudio.scene.getState().objects.at(idx)), idx);
const prim = async (kind, size, color = 0) => { await page.evaluate(({ kind, size, color }) => window.__meshStudio.tools.addPrimitive(kind, size, 48, color), { kind, size, color }); await settle(page); };
const setNum = async (sel, v) => { await page.locator(sel).fill(String(v)); await page.locator(sel).press('Enter'); };
const boxes = () => page.evaluate(() => window.__meshStudio.scene.getState().objects.map((o) => { const b = window.__meshStudio.geo.worldBox(o); return [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].map((v) => Math.round(v * 1000) / 1000); }));
const close = (a, b, e = 1e-3) => Math.abs(a - b) <= e;

// ---------- linear pattern ----------
await prim('box', [10, 10, 10]);
await page.getByRole('tab', { name: 'Edit' }).click();
await page.evaluate(() => window.__meshStudio.app.getState().setPanelOpen('Pattern / copies', true));
const P = page.locator('[data-panel="Pattern / copies"]');
await setNum('#pat-count', 4); await setNum('#pat-spacing', 5);
await P.getByRole('button', { name: /Create 4 × pattern/ }).click();
let b = await boxes();
ok(b.length === 4 && b.every((x, i) => close(x[0] - b[0][0], i * 15) && close(x[1], b[0][1])), 'linear: 4 boxes, 5 mm gaps (15 mm pitch) along X');
await page.keyboard.press('Control+z');
ok((await sceneState(page)).objects.length === 1, 'pattern is one undo step');
// grid, centre-to-centre
await P.getByRole('radio', { name: 'Centre to centre' }).click();
await setNum('#pat-count', 3); await setNum('#pat-spacing', 20); await setNum('#pat-count2', 2); await setNum('#pat-spacing2', 25);
await page.evaluate(() => window.__meshStudio.scene.getState().selectAll());
await P.getByRole('button', { name: /Create 6 × pattern/ }).click();
b = await boxes();
const xs = [...new Set(b.map((x) => x[0]))].sort((p, q) => p - q), ys = [...new Set(b.map((x) => x[1]))].sort((p, q) => p - q);
ok(b.length === 6 && xs.length === 3 && ys.length === 2 && close(xs[1] - xs[0], 20) && close(ys[1] - ys[0], 25), 'grid: 3 × 2, 20 mm and 25 mm pitch');
await shot(page, 'p17-grid');

// ---------- circular pattern ----------
await reset(page);
await prim('box', [4, 10, 6]);
await page.evaluate(() => window.__meshStudio.app.getState().setPanelOpen('Pattern / copies', true));
await P.getByRole('radio', { name: 'Circular' }).click();
await setNum('#pat-ccount', 8); await setNum('#pat-angle', 360); await setNum('#pat-radius', 30);
const c0 = await page.evaluate(() => { const b = window.__meshStudio.geo.worldBox(window.__meshStudio.scene.getState().objects[0]); return [(b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2]; });
await P.getByRole('button', { name: /Create 8 × pattern/ }).click();
const centres = await page.evaluate(() => window.__meshStudio.scene.getState().objects.map((o) => { const b = window.__meshStudio.geo.worldBox(o); return [(b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2]; }));
const pivot = [c0[0] - 30, c0[1]];
ok(centres.length === 8 && centres.every((c) => close(Math.hypot(c[0] - pivot[0], c[1] - pivot[1]), 30, 0.01)), 'circular: 8 copies on a 30 mm circle');
const angles = centres.map((c) => Math.atan2(c[1] - pivot[1], c[0] - pivot[0])).sort((p, q) => p - q);
ok(angles.slice(1).every((a, i) => close(a - angles[i], Math.PI / 4, 1e-3)), 'copies 45° apart');
await shot(page, 'p17-circular');
// merged
await reset(page);
await prim('box', [4, 4, 4]);
await page.evaluate(() => window.__meshStudio.app.getState().setPanelOpen('Pattern / copies', true));
await P.getByRole('radio', { name: 'Circular' }).click();
await setNum('#pat-ccount', 3);
await P.locator('#pat-merge').click();
await P.getByRole('button', { name: /Create 3 × pattern/ }).click();
let a = await analyze();
ok((await sceneState(page)).objects.length === 1 && a.components === 3 && Math.abs(a.volume - 192) < 0.1, 'merged pattern: one object with 3 pieces');
await P.locator('#pat-merge').click();

// ---------- object snapping while moving ----------
const snap = (box, others, axes, d) => page.evaluate(({ box, others, axes, d }) => window.__meshStudio.snapToObjects(box, others, axes, d), { box, others, axes, d });
let r = await snap([0, 0, 0, 10, 10, 10], [[11.2, 0, 0, 21.2, 10, 10]], 'x', 2);
ok(close(r.dx, 1.2) && /touching/.test(r.hits), 'moving next to an object snaps to touch it (1.2 mm away)');
r = await snap([0.5, 0, 0, 10.5, 10, 10], [[0, 30, 0, 10, 40, 10]], 'xy', 2);
ok(close(r.dx, -0.5) && r.dy === 0, 'sides line up flush with an object further away on the other axis');
r = await snap([0, 0, 3, 10, 10, 13], [], 'z', 2);
ok(r.dz === 0, 'nothing within reach → no snap');
r = await snap([0, 0, 1.5, 10, 10, 11.5], [], 'z', 2);
ok(close(r.dz, -1.5) && /grid/.test(r.hits), 'bottom snaps onto the grid');
// real gizmo drag: box B dragged to 1.2 mm from box A snaps to touch it
await reset(page);
await prim('box', [10, 10, 10]);
await prim('box', [10, 10, 10]);
await page.evaluate(() => { const s = window.__meshStudio.scene.getState(); const [a, bb] = s.objects; s.apply('place', { objects: [{ ...a, position: [0, 0, 5] }, { ...bb, position: [30, 0, 5] }], selectedIds: [bb.id] }); });
await page.evaluate(() => window.__meshStudio.app.getState().requestCamera('top', 'all'));
await page.waitForTimeout(600);
await page.evaluate(() => window.__meshStudio.app.getState().setActiveTool('measure'));
await page.waitForTimeout(200);
const [gx, gy] = await page.evaluate(() => window.__meshStudio.measure.viewport.project([30, 0, 5]));
const [ax] = await page.evaluate(() => window.__meshStudio.measure.viewport.project([0, 0, 5]));
const pxPerMm = (gx - ax) / 30;
await page.evaluate(() => window.__meshStudio.app.getState().setActiveTool(null));
await page.waitForTimeout(300);
let dragged = 30;
for (const off of [-40, -60, -75, -90]) {
  await page.mouse.move(gx + off, gy);
  await page.mouse.down();
  await page.mouse.move(gx + off - 18.8 * pxPerMm, gy, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  dragged = await page.evaluate(() => window.__meshStudio.scene.getState().objects[1].position[0]);
  if (Math.abs(dragged - 30) > 0.01) break;
}
ok(Math.abs(dragged - 10) < 1e-6, `gizmo drag to 1.2 mm away snaps the box against its neighbour (x = ${dragged})`);
await shot(page, 'p17-snap-drag');

// ---------- adjustable snap steps ----------
await page.getByRole('button', { name: 'Settings' }).click();
await setNum('#set-snap-move', 2.5); await setNum('#set-snap-rot', 30); await setNum('#set-objsnap-d', 4); await setNum('#set-msnap', 12);
const st = await page.evaluate(() => { const s = window.__meshStudio.settings.getState(); return [s.snapMove, s.snapRotate, s.objectSnapDistance, s.measureSnapPx]; });
ok(JSON.stringify(st) === '[2.5,30,4,12]', 'snap steps and distances are adjustable in Settings: ' + JSON.stringify(st));
await page.reload();
await page.waitForSelector('[data-testid=viewport] canvas');
ok((await page.evaluate(() => window.__meshStudio.settings.getState().snapMove)) === 2.5, 'snap settings persist');
await page.evaluate(() => window.__meshStudio.settings.getState().reset());

// ---------- measure snapping switches + face to face ----------
await prim('box', [30, 20, 10]);
await page.getByRole('tab', { name: 'Scene' }).click();
await page.evaluate(() => window.__meshStudio.app.getState().setPanelOpen('Measure', true));
const M = page.locator('[data-panel="Measure"]');
await M.getByRole('button', { name: /Start measuring/ }).click();
await page.evaluate(() => window.__meshStudio.app.getState().requestCamera('top', 'selection'));
await page.waitForTimeout(500);
const [cx, cy, top] = await page.evaluate(() => { const b = window.__meshStudio.geo.worldBox(window.__meshStudio.scene.getState().objects[0]); return [(b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, b.max.z]; });
const hover = async (p) => { const [x, y] = await page.evaluate((p) => window.__meshStudio.measure.viewport.project(p), p); await page.mouse.move(x + 0.5, y + 0.5, { steps: 2 }); await page.waitForTimeout(120); return (await page.locator('[data-testid=measure-hover-panel]').innerText().catch(() => '')).replace(/\s+/g, ' '); };
ok(/Corner/.test(await hover([cx - 15 + 0.1, cy - 10 + 0.1, top])), 'corner snap on');
await M.locator('#ms-snap').click();
const off = await hover([cx - 15 + 0.12, cy - 10 + 0.12, top]);
ok(!/Corner/.test(off) && /Edge/.test(off), 'corner snapping switched off → the edge is picked instead: ' + off);
await M.locator('#ms-snap').click();
await setNum('#ms-snap-px', 2);
const tight = await hover([cx - 8, cy - 10 + 0.4, top]);
ok(/Face/.test(tight), 'a smaller snap radius picks the face instead of the nearby edge');
await setNum('#ms-snap-px', 8);
// face to face: top and bottom (parallel) via the API, top and side (angle)
const faces = await page.evaluate(({ cx, cy, top }) => {
  const { scene, measure } = window.__meshStudio;
  const o = scene.getState().objects[0];
  const p = window.__meshStudio.geo.worldPositions(o);
  const find = (nz, ny) => { for (let t = 0; t < p.length / 9; t++) { const ax = p[t*9+3]-p[t*9], ay = p[t*9+4]-p[t*9+1], az = p[t*9+5]-p[t*9+2], bx = p[t*9+6]-p[t*9], by = p[t*9+7]-p[t*9+1], bz = p[t*9+8]-p[t*9+2]; const n = [ay*bz-az*by, az*bx-ax*bz, ax*by-ay*bx]; const l = Math.hypot(...n); if (Math.abs(n[2]/l - nz) < 1e-6 && Math.abs(n[1]/l - ny) < 1e-6) return t; } };
  const v = (x, y, z) => ({ x, y, z, clone() { return { applyMatrix4: (m) => { const e = m.elements; return { toArray: () => [e[0]*x+e[4]*y+e[8]*z+e[12], e[1]*x+e[5]*y+e[9]*z+e[13], e[2]*x+e[6]*y+e[10]*z+e[14]] }; } }; } });
  const T = measure.pickFeature(o, find(1, 0), v(cx - 9, cy, top), { limit: 0.1, onlyPlane: true });
  const B = measure.pickFeature(o, find(-1, 0), v(cx - 9, cy, top - 10), { limit: 0.1, onlyPlane: true });
  const S = measure.pickFeature(o, find(0, -1), v(cx - 9, cy - 10, top - 5), { limit: 0.1, onlyPlane: true });
  const f = (x) => x.toFixed(2);
  return [measure.measure(T, B, f).rows, measure.measure(T, S, f).rows];
}, { cx, cy, top });
ok(faces[0].some(([k, v]) => /Distance \(parallel\)/.test(k) && v === '10.00'), 'face ↔ face (parallel): 10 mm');
ok(faces[1].some(([k, v]) => k === 'Angle' && v === '90.00°'), 'face ↔ face (perpendicular): 90°');
await page.evaluate(() => window.__meshStudio.app.getState().setActiveTool(null));

// ---------- exports ----------
await reset(page);
await prim('box', [20, 20, 20], 3);
await prim('cylinder', [10, 10, 20], 5);
async function exportAs(format, name) {
  await page.evaluate(() => window.__meshStudio.app.getState().setDialog('export'));
  await page.waitForSelector('#ex-format');
  await page.selectOption('#ex-format', format);
  await page.getByRole('dialog').getByRole('radio', { name: 'All' }).click();
  await page.locator('#ex-name').fill(name);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('dialog').getByRole('button', { name: /^Export / }).click()]);
  const path = join(DL, dl.suggestedFilename());
  await dl.saveAs(path);
  await settle(page);
  return path;
}
const before = await analyze(0);
const stepPath = await exportAs('step', 'solids');
const stepText = readFileSync(stepPath, 'utf8');
ok(stepPath.endsWith('.step') && /MANIFOLD_SOLID_BREP\(/.test(stepText) && (stepText.match(/CLOSED_SHELL/g) || []).length === 2 && /COLOUR_RGB/.test(stepText), 'STEP: two B-rep solids with colours');
// OpenCascade (the same engine CAD programs use) reads it back
const occt = await createRequire(import.meta.url)('../../node_modules/occt-import-js/dist/occt-import-js.js')();
const res = occt.ReadStepFile(new Uint8Array(readFileSync(stepPath)), null);
ok(res.success && res.meshes.length === 2, `OpenCascade reads the STEP file: ${res.meshes.length} solids`);
await reset(page);
await pick(page, [stepPath]);
a = await analyze(0);
ok((await sceneState(page)).objects.length === 2 && a.manifold && Math.abs(Math.abs(a.volume) - Math.abs(before.volume)) < 1, 'STEP re-imports as 2 watertight solids with the same volume');
await reset(page);
await prim('box', [20, 20, 20], 3);
const scadPath = await exportAs('scad', 'mesh');
const scad = readFileSync(scadPath, 'utf8');
ok(/polyhedron\(points = \[/.test(scad) && /color\(\[0\.937, 0\.420, 0\.451\]\)/.test(scad) && (scad.match(/\],\[/g) || []).length > 10, 'OpenSCAD: coloured polyhedron');
const plyPath = await exportAs('ply', 'mesh');
const amfPath = await exportAs('amf', 'mesh');
await reset(page);
await pick(page, [plyPath]);
a = await analyze(0);
const plyColours = await page.evaluate(() => { const s = window.__meshStudio.scene.getState(); return [...new Set(s.objects[0].faceColors)].map((c) => s.palette[c]); });
ok(a.manifold && Math.abs(a.volume - 8000) < 0.5 && plyColours.length === 1 && plyColours[0] === '#ef6b73', 'PLY round trip: watertight 8000 mm³ in its colour');
await reset(page);
await pick(page, [amfPath]);
a = await analyze(0);
ok(a.manifold && Math.abs(a.volume - 8000) < 0.5, 'AMF round trip: watertight 8000 mm³');
// Generator objects still offer their own .scad source
const opts = await page.evaluate(() => { window.__meshStudio.app.getState().setDialog('export'); return null; });
await page.waitForSelector('#ex-format');
const labels = await page.$$eval('#ex-format option', (os) => os.map((o) => o.textContent));
ok(['STEP', 'OpenSCAD', 'PLY', 'AMF'].every((k) => labels.some((l) => l.includes(k))), 'export list includes STEP, OpenSCAD, PLY, AMF');
await page.keyboard.press('Escape');

await finish(browser, problems);
