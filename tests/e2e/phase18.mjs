// Generator library (91, search / categories / favourites) and the gaps closed after
// the owner's review: VRML import, exploded view, place on face, curved-wall radius,
// snap-fit connectors, rebuild as solid, negative parts, linked copies, refine for
// painting, STEP with merged planar faces, laser SVG / DXF export.
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { launch, ok, pick, sceneState, objectSize, objectBox, reset, shot, finish, settle, errorText, FIX } from './harness.mjs';
import { makeFixtures } from './fixtures.mjs';

makeFixtures();
writeFileSync(join(FIX, 'cube.wrl'), `#VRML V2.0 utf8
Shape { appearance Appearance { material Material { diffuseColor 0 0.5 1 } }
 geometry IndexedFaceSet { coord Coordinate { point [ 0 0 0, 20 0 0, 20 20 0, 0 20 0, 0 0 20, 20 0 20, 20 20 20, 0 20 20 ] }
 coordIndex [ 0 3 2 1 -1, 4 5 6 7 -1, 0 1 5 4 -1, 1 2 6 5 -1, 2 3 7 6 -1, 3 0 4 7 -1 ] } }`);
const BASE_URL = process.argv[2] || 'http://localhost:5173/';
const { browser, page, problems } = await launch(BASE_URL);
const DL = join(tmpdir(), 'mesh-studio-downloads');
mkdirSync(DL, { recursive: true });
const analyze = (idx = -1) => page.evaluate(async (idx) => window.__meshStudio.analyze(window.__meshStudio.scene.getState().objects.at(idx)), idx);
const prim = async (kind, size, color = 0, segs = 64) => { await page.evaluate(({ kind, size, color, segs }) => window.__meshStudio.tools.addPrimitive(kind, size, segs, color), { kind, size, color, segs }); await settle(page); };
const setNum = async (sel, v) => { await page.locator(sel).fill(String(v)); await page.locator(sel).press('Enter'); };
const place = (idx, p) => page.evaluate(({ idx, p }) => { const s = window.__meshStudio.scene.getState(); const o = s.objects.at(idx); s.updateObject('move', o.id, { position: p }); }, { idx, p });
const select = (...idx) => page.evaluate((idx) => { const s = window.__meshStudio.scene.getState(); s.select(idx.map((i) => s.objects.at(i).id)); }, idx);
const close = (a, b, e) => Math.abs(a - b) <= e;
async function exportAs(format, name, scope = 'All') {
  await page.evaluate(() => window.__meshStudio.app.getState().setDialog('export'));
  await page.waitForSelector('#ex-format');
  await page.selectOption('#ex-format', format);
  await page.getByRole('dialog').getByRole('radio', { name: scope }).click();
  await page.locator('#ex-name').fill(name);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('dialog').getByRole('button', { name: /^Export / }).click()]);
  const path = join(DL, dl.suggestedFilename());
  await dl.saveAs(path);
  await settle(page);
  return path;
}

// ---------- generator library ----------
await page.getByRole('tab', { name: 'Create' }).click();
const G = page.locator('[data-panel="Generators (OpenSCAD)"]');
ok((await G.locator('[data-generator]').count()) === 91, '91 generators in the library');
await G.getByRole('searchbox', { name: 'Search generators' }).fill('skådis');
ok((await G.locator('[data-generator]').count()) === 4, 'search "skådis" finds the 4 pegboard generators');
await G.getByRole('searchbox', { name: 'Search generators' }).fill('');
await G.getByRole('button', { name: 'Mechanical', exact: true }).click();
const mech = await G.locator('[data-generator]').evaluateAll((els) => els.map((e) => e.getAttribute('data-generator')));
ok(mech.includes('rack-pinion') && mech.includes('planetary-set') && mech.includes('spur-gear') && !mech.includes('box'), 'Mechanical chip filters the list: ' + mech.length);
await G.getByRole('button', { name: 'Add Rack & Pinion to favourites' }).click();
await G.getByRole('button', { name: /Favourites/ }).click();
ok((await G.locator('[data-generator]').count()) === 1, 'favourites list');
await page.reload();
await page.waitForSelector('[data-testid=viewport] canvas');
await page.getByRole('tab', { name: 'Create' }).click();
await G.getByRole('button', { name: /Favourites \(1\)/ }).click();
ok((await G.locator('[data-generator]').count()) === 1, 'favourites remembered on this device');
await G.locator('[data-generator="rack-pinion"]').click();
await settle(page, 120000);
ok((await sceneState(page)).objects.length === 1 && (await analyze()).manifold, 'rack & pinion renders watertight from the library');
await page.evaluate(() => { try { localStorage.removeItem('mesh-studio:generator-favourites'); } catch {} });

// ---------- VRML ----------
await reset(page);
await pick(page, ['cube.wrl']);
let a = await analyze();
const c = await page.evaluate(() => { const s = window.__meshStudio.scene.getState(); return [...new Set(s.objects[0].faceColors)].map((i) => s.palette[i]); });
ok(a.manifold && close(a.volume, 8000, 0.5) && c.length === 1 && c[0] !== '#b58fd0', 'VRML cube: watertight 8000 mm³ with its material colour ' + c);

// ---------- exploded view ----------
await reset(page);
await prim('box', [10, 10, 10]);
await prim('box', [10, 10, 10]);
await place(0, [0, 0, 5]); await place(1, [12, 0, 5]);
const meshX = () => page.evaluate(() => window.__meshStudio.scene.getState().objects.map((o) => o.position[0]));
await page.evaluate(() => window.__meshStudio.app.getState().setExplode(0.8));
await page.waitForTimeout(150);
ok(JSON.stringify(await meshX()) === '[0,12]', 'exploded view does not move the objects themselves');
await shot(page, 'p18-exploded');
await page.evaluate(() => window.__meshStudio.app.getState().setExplode(0));

// ---------- place on face ----------
await reset(page);
await prim('box', [40, 40, 20]);
await prim('cylinder', [10, 10, 30]);
await place(1, [80, 0, 15]);
await select(1);
await page.evaluate(() => window.__meshStudio.app.getState().setActiveTool('placeon'));
await page.evaluate(() => window.__meshStudio.app.getState().requestCamera('top', 'all'));
await page.waitForTimeout(500);
// click the top of the box: find it on screen with the measure projection
await page.evaluate(() => window.__meshStudio.app.getState().setActiveTool('measure'));
await page.waitForTimeout(150);
const [bx, by] = await page.evaluate(() => window.__meshStudio.measure.viewport.project([5, 5, 20]));
await page.evaluate(() => window.__meshStudio.app.getState().setActiveTool('placeon'));
await page.waitForTimeout(150);
await page.mouse.click(bx, by);
await page.waitForTimeout(200);
let box = await objectBox(page, 1);
ok(close(box.min[2], 20, 0.01) && close((box.min[0] + box.max[0]) / 2, 5, 0.6) && close((box.min[1] + box.max[1]) / 2, 5, 0.6), `cylinder placed standing on the box top at the click (${JSON.stringify(box)})`);
// on a side face it lies down against it
await page.evaluate(() => {
  const { scene, app } = window.__meshStudio;
  const s = scene.getState();
  const [target, moving] = s.objects;
  const p = window.__meshStudio.geo.worldPositions(target);
  app.getState().setActiveTool(null);
  return null;
});

// ---------- curved wall radius ----------
await reset(page);
await prim('box', [40, 40, 20]);
await prim('cylinder', [16, 16, 40]);
await place(1, [0, 0, 10]);
await select(0, 1);
await page.evaluate(() => window.__meshStudio.tools.runBoolean('subtract', false));
await settle(page);
const cyl = await page.evaluate(() => {
  const { scene, measure, geo } = window.__meshStudio;
  const o = scene.getState().objects[0];
  const p = geo.worldPositions(o);
  // a triangle on the hole wall: all vertices about 8 mm from the axis, normal horizontal
  for (let t = 0; t < p.length / 9; t++) {
    const r = [0, 1, 2].map((k) => Math.hypot(p[t * 9 + k * 3], p[t * 9 + k * 3 + 1]));
    if (r.every((x) => Math.abs(x - 8) < 0.05)) {
      const pt = { x: p[t * 9], y: p[t * 9 + 1], z: (p[t * 9 + 2] + p[t * 9 + 5] + p[t * 9 + 8]) / 3 };
      pt.clone = () => ({ applyMatrix4: (m) => { const e = m.elements; return { toArray: () => [e[0] * pt.x + e[4] * pt.y + e[8] * pt.z + e[12], e[1] * pt.x + e[5] * pt.y + e[9] * pt.z + e[13], e[2] * pt.x + e[6] * pt.y + e[10] * pt.z + e[14]] }; } });
      const f = measure.pickFeature(o, t, pt, { limit: 0.1 });
      return f && { type: f.type, r: f.radius, len: f.cylinder?.length, axis: f.normal, area: f.area, tris: f.triangles?.length };
    }
  }
  return null;
});
ok(cyl && cyl.type === 'circle' && close(cyl.r, 8, 0.1) && close(cyl.len, 20, 0.05) && Math.abs(Math.abs(cyl.axis[2]) - 1) < 1e-3, `clicking the hole wall measures Ø ${cyl && (cyl.r * 2).toFixed(2)} mm, wall length ${cyl && cyl.len?.toFixed(2)} mm, vertical axis`);

// ---------- snap-fit connector ----------
await reset(page);
await prim('box', [30, 30, 40]);
await page.getByRole('tab', { name: 'Edit' }).click();
await page.locator('[data-panel="Cut / split"]').getByRole('button', { name: /Start cut/ }).click();
const cutP = page.locator('[data-panel="Cut / split"]');
await cutP.getByRole('radio', { name: 'Snap', exact: true }).click();
await cutP.getByRole('radio', { name: '1', exact: true }).click();
await setNum('#pin-d', 6); await setNum('#pin-depth', 8);
await cutP.getByRole('button', { name: 'Cut', exact: true }).click();
await settle(page);
const lower = await analyze(0), upper = await analyze(1);
ok(lower.manifold && upper.manifold && Math.abs(lower.volume) > 18000 && Math.abs(upper.volume) < 18000, `snap connector: barbed plug on the lower part (+${(Math.abs(lower.volume) - 18000).toFixed(0)} mm³), socket in the upper (−${(18000 - Math.abs(upper.volume)).toFixed(0)} mm³)`);
ok(close((await objectSize(page, 0))[2], 28, 0.05), 'snap plug rises 8 mm above the lower cut face');
await shot(page, 'p18-snap');
await page.evaluate(() => window.__meshStudio.cut.getState().setConnectors({ type: 'none' }));

// ---------- rebuild as solid ----------
await reset(page);
await prim('box', [20, 20, 20]);
await prim('box', [20, 20, 20]);
await place(0, [0, 0, 10]); await place(1, [10, 0, 20]);
await page.evaluate(() => window.__meshStudio.scene.getState().selectAll());
await page.locator('[data-panel="Parts"]').getByRole('button', { name: 'Merge selected into one object' }).click();
// knock out one triangle too: open + overlapping
await page.evaluate(() => {
  const s = window.__meshStudio.scene.getState();
  const o = s.objects[0];
  const p = o.geometry.getAttribute('position').array.slice(9);
  const g = o.geometry.clone();
  const { BufferAttribute } = g.getAttribute('position').constructor === Float32Array ? {} : {};
  g.setAttribute('position', new (o.geometry.getAttribute('position').constructor)(p, 3));
  g.setAttribute('color', new (o.geometry.getAttribute('color').constructor)(o.geometry.getAttribute('color').array.slice(9), 3, true));
  s.updateObject('break', o.id, { geometry: g, faceColors: o.faceColors.slice(1) });
});
a = await analyze();
ok(!a.manifold, 'overlapping, open mesh is not watertight');
await page.getByRole('button', { name: /Rebuild as solid/ }).click();
await settle(page, 120000);
a = await analyze();
ok(a.manifold && a.components === 1 && close(Math.abs(a.volume), 14000, 700), `rebuilt as one watertight solid, ${Math.abs(a.volume).toFixed(0)} mm³ (union 14000)`);

// ---------- negative parts ----------
await reset(page);
await prim('box', [30, 30, 20]);
await prim('cylinder', [10, 10, 30]);
await place(1, [0, 0, 10]);
await select(1);
await page.getByRole('tab', { name: 'Scene' }).click();
await page.locator('[data-testid=part-role]').getByRole('switch', { name: 'Negative part' }).click();
ok((await page.evaluate(() => window.__meshStudio.scene.getState().objects[1].role)) === 'negative', 'cylinder marked as a negative part (kept as its own object)');
await shot(page, 'p18-negative');
const negPath = await exportAs('stl', 'neg');
await reset(page);
await pick(page, [negPath]);
a = await analyze();
ok((await sceneState(page)).objects.length === 1 && close(Math.abs(a.volume), 18000 - Math.PI * 25 * 20, 40) && a.genus === 1, `export cuts the negative part out (${Math.abs(a.volume).toFixed(0)} mm³, hole through)`);
await reset(page);
await prim('box', [30, 30, 20]);
await prim('cylinder', [10, 10, 30]);
await place(1, [0, 0, 10]);
await page.evaluate(() => { const s = window.__meshStudio.scene.getState(); s.updateObject('neg', s.objects[1].id, { role: 'negative' }); s.select([s.objects[1].id]); });
await page.locator('[data-testid=part-role]').getByRole('button', { name: /Apply negative parts/ }).click();
await settle(page);
a = await analyze();
ok((await sceneState(page)).objects.length === 1 && a.genus === 1, 'Apply subtracts it in the scene (one undo step)');

// ---------- linked copies ----------
await reset(page);
await prim('box', [10, 10, 10]);
await page.getByRole('tab', { name: 'Edit' }).click();
await page.evaluate(() => window.__meshStudio.app.getState().setPanelOpen('Pattern / copies', true));
const P = page.locator('[data-panel="Pattern / copies"]');
await P.getByRole('radio', { name: 'Linear / grid' }).click();
await setNum('#pat-count', 3); await setNum('#pat-count2', 1);
await P.locator('#pat-linked').click();
await P.getByRole('button', { name: /Create 3 × pattern/ }).click();
const linkIds = await page.evaluate(() => window.__meshStudio.scene.getState().objects.map((o) => o.linkId));
ok(linkIds.length === 3 && linkIds.every((l) => l && l === linkIds[0]), 'linked pattern: 3 copies in one link group');
await page.evaluate(() => { const s = window.__meshStudio.scene.getState(); const o = s.objects[2]; const fc = o.faceColors.slice(); fc.fill(3, 0, 2); s.updateObject('paint', o.id, { faceColors: fc }); });
const reds = await page.evaluate(() => window.__meshStudio.scene.getState().objects.map((o) => [...o.faceColors].filter((c) => c === 3).length));
ok(JSON.stringify(reds) === '[2,2,2]', 'painting one linked copy paints all of them');
await select(1);
await page.getByRole('tab', { name: 'Scene' }).click();
await page.locator('[data-testid=part-role]').getByRole('button', { name: 'Unlink' }).click();
const after = await page.evaluate(() => window.__meshStudio.scene.getState().objects.map((o) => o.linkId ?? null));
ok(after[1] === null && after[0] && after[0] === after[2], 'Unlink makes that copy independent');

// ---------- refine for painting ----------
await reset(page);
await prim('box', [20, 20, 20]);
await page.getByRole('tab', { name: 'Paint' }).click();
await setNum('#pt-refine', 2);
await page.getByRole('button', { name: 'Refine selected for painting' }).click();
await settle(page);
a = await analyze();
ok(a.triangles > 12 * 50 && close(a.volume, 8000, 0.01) && a.manifold, `refined for painting: ${a.triangles} triangles, same shape`);

// ---------- STEP faces + laser ----------
await reset(page);
await prim('box', [20, 30, 10]);
let path = await exportAs('step', 'box');
let text = readFileSync(path, 'utf8');
ok((text.match(/ADVANCED_FACE/g) || []).length === 6, 'STEP box has 6 planar faces (coplanar triangles merged)');
await reset(page);
await prim('box', [40, 40, 10]);
await prim('cylinder', [10, 10, 30]);
await place(1, [0, 0, 5]);
await page.evaluate(() => window.__meshStudio.scene.getState().selectAll());
await page.evaluate(() => window.__meshStudio.tools.runBoolean('subtract', false));
await settle(page);
const before = Math.abs((await analyze()).volume);
path = await exportAs('step', 'plate');
text = readFileSync(path, 'utf8');
const occt = await createRequire(import.meta.url)('../../node_modules/occt-import-js/dist/occt-import-js.js')();
const res = occt.ReadStepFile(new Uint8Array(readFileSync(path)), null);
ok(res.success && res.meshes.length === 1 && /FACE_BOUND\(/.test(text), 'plate with a hole: faces with inner boundaries, read by OpenCascade');
await reset(page);
await pick(page, [path]);
a = await analyze();
ok(a.manifold && close(Math.abs(a.volume), before, 2) && a.genus === 1, `STEP re-import keeps the hole (${Math.abs(a.volume).toFixed(0)} mm³)`);
// laser
await reset(page);
await page.evaluate(async () => { const o = await window.__meshStudio.generators.render('laser-finger-box'); window.__meshStudio.scene.getState().addObjects('x', [o]); });
await settle(page);
path = await exportAs('svg-laser', 'panels');
text = readFileSync(path, 'utf8');
ok(/width="\d+(\.\d+)?mm"/.test(text) && (text.match(/M[\d.]+ [\d.]+ L/g) || []).length >= 6, 'laser SVG: mm units, outlines of the 6 panels');
path = await exportAs('dxf-laser', 'panels');
text = readFileSync(path, 'utf8');
ok(/POLYLINE/.test(text) && /\$INSUNITS\n70\n4/.test(text), 'laser DXF: closed polylines in millimetres');
ok(!(await errorText(page)), 'no error banner');

await finish(browser, problems);
