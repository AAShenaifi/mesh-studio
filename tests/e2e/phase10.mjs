// Gap features, batch 1: split into parts, merge, keep one cut half, simplify (QEM port),
// smooth, extrude down, brim ears, fix normals, merge overlaps, auto orient (Orient.cpp
// port), overhang shading, arrange / align / distribute.
import { launch, ok, pick, sceneState, objectSize, objectBox, reset, shot, finish, settle, errorText } from './harness.mjs';

const BASE_URL = process.argv[2] || 'http://localhost:5173/';
const { browser, page, problems } = await launch(BASE_URL);
const analyze = (idx = -1) => page.evaluate(async (idx) => window.__meshStudio.analyze(window.__meshStudio.scene.getState().objects.at(idx)), idx);
const tab = (name) => page.getByRole('tab', { name }).click();
const panel = (t) => page.locator(`[data-panel="${t}"]`);
const setNum = async (sel, v) => { await page.locator(sel).fill(String(v)); await page.locator(sel).press('Enter'); };
const near = (a, b, eps = 0.05) => a.every((v, i) => Math.abs(v - b[i]) <= eps);
const prim = async (kind, size, color = 0) => { await page.evaluate(({ kind, size, color }) => window.__meshStudio.tools.addPrimitive(kind, size, 64, color), { kind, size, color }); await settle(page); };
const selectIdx = (...idx) => page.evaluate((idx) => { const s = window.__meshStudio.scene.getState(); s.select(idx.map((i) => s.objects.at(i).id)); }, idx);
const move = (idx, p) => page.evaluate(({ idx, p }) => { const s = window.__meshStudio.scene.getState(); const o = s.objects.at(idx); s.updateObject('move', o.id, { position: p }); }, { idx, p });
const count = async () => (await sceneState(page)).objects.length;

// ---------- merge without boolean, then split into parts ----------
await prim('box', [20, 20, 20]);
await prim('sphere', [16, 16, 16]);
await selectIdx(0, 1);
await tab('Edit');
await panel('Parts').getByRole('button', { name: 'Merge selected into one object' }).click();
ok((await count()) === 1, 'merge: two objects become one');
let a = await analyze();
ok(a.components === 2, 'merged object has 2 pieces (no boolean): ' + a.components);
await panel('Parts').getByRole('button', { name: /Split into parts/ }).click();
await settle(page);
let st = await sceneState(page);
ok(st.objects.length === 2 && st.selectedIds.length === 2, 'split into parts → 2 objects, both selected');
a = await analyze(0); const b = await analyze(1);
ok(a.manifold && b.manifold && [a, b].some((x) => Math.abs(Math.abs(x.volume) - 8000) < 1), 'split parts are watertight; box part keeps 8000 mm³');
await page.keyboard.press('Control+z');
ok((await count()) === 1, 'undo split');

// hollow box: the cavity stays with its shell
await reset(page);
await prim('box', [30, 30, 30]);
await page.evaluate(() => window.__meshStudio.app.getState().setPanelOpen('Hollow', true));
await page.waitForTimeout(100);
await page.locator('[data-panel="Hollow"]').getByRole('button', { name: /^Hollow/ }).click();
await settle(page);
a = await analyze();
ok(a.components === 2, 'hollow box has 2 shells');
await panel('Parts').getByRole('button', { name: /Split into parts/ }).click();
await settle(page);
ok((await count()) === 1 && /single piece/.test(await page.evaluate(() => window.__meshStudio.app.getState().notice ?? '')), 'cavity shell is not split off (notice shown)');

// ---------- cut: keep upper only ----------
await reset(page);
await prim('box', [20, 20, 40]);
await page.getByRole('button', { name: /Start cut/ }).click();
await panel('Cut / split').getByRole('radio', { name: 'Upper' }).click();
await page.getByRole('button', { name: 'Cut', exact: true }).click();
await settle(page);
st = await sceneState(page);
ok(st.objects.length === 1 && near(await objectSize(page), [20, 20, 20], 0.05) && (await objectBox(page)).min[2] > 19, 'cut keeps only the upper half');

// ---------- simplify ----------
await reset(page);
await prim('sphere', [40, 40, 40]);
const before = (await sceneState(page)).objects[0].tris;
await page.evaluate(() => window.__meshStudio.app.getState().setPanelOpen('Simplify / smooth / extrude', true));
await setNum('#simp-ratio', 25);
await page.getByRole('button', { name: 'Simplify (keep shape)' }).click();
await settle(page);
const after = (await sceneState(page)).objects[0].tris;
a = await analyze();
ok(after <= before * 0.26 && after >= before * 0.2, `simplify 25%: ${before} → ${after} triangles`);
ok(a.manifold && Math.abs(a.volume - 33510) / 33510 < 0.03 && near(await objectSize(page), [40, 40, 40], 1), `simplified sphere stays watertight, volume ${a.volume.toFixed(0)} mm³ (within 3%)`);

// ---------- smooth ----------
await reset(page);
await prim('box', [20, 20, 20]);
await page.evaluate(() => window.__meshStudio.app.getState().setPanelOpen('Simplify / smooth / extrude', true));
await setNum('#smooth-n', 3);
await setNum('#smooth-sharp', 100);
await page.getByRole('button', { name: 'Smooth', exact: true }).click();
await settle(page);
a = await analyze();
ok(a.manifold && a.triangles === 12 * 9 && Math.abs(Math.abs(a.volume) - 8000) > 500, `smooth turns the box into a curved, watertight blob: ${a.triangles} triangles, ${Math.abs(a.volume).toFixed(0)} mm³`);

// ---------- extrude down ----------
await reset(page);
await prim('sphere', [20, 20, 20]);
await move(0, [0, 0, 25]);
await page.evaluate(() => window.__meshStudio.app.getState().setPanelOpen('Simplify / smooth / extrude', true));
await page.getByRole('button', { name: 'Extrude down to the grid' }).click();
await settle(page);
a = await analyze();
let box = await objectBox(page);
ok(a.manifold && Math.abs(box.min[2]) < 0.02 && Math.abs(box.max[2] - 35) < 0.1, `extrude down reaches the grid (z ${box.min[2]}…${box.max[2]})`);
ok(Math.abs(a.volume) > 4188 + Math.PI * 100 * 15 * 0.9, `extruded column adds volume (${Math.abs(a.volume).toFixed(0)} mm³)`);
await shot(page, 'p10-extrude-down');

// ---------- brim ears ----------
await reset(page);
await prim('box', [30, 20, 10]);
await page.evaluate(() => window.__meshStudio.app.getState().setPanelOpen('Simplify / smooth / extrude', true));
await page.getByRole('button', { name: 'Add brim ears' }).click();
await settle(page);
a = await analyze();
const size = await objectSize(page);
ok(a.manifold && near(size, [40, 30, 10], 0.2), 'four 10 mm ears on the corners: footprint 40 × 30 ' + JSON.stringify(size));
ok(/4 brim ears/.test(await page.evaluate(() => JSON.stringify(window.__meshStudio.app.getState().status))), 'status reports 4 ears');

// ---------- fix normals ----------
await reset(page);
await prim('box', [20, 20, 20]);
await page.evaluate(() => {
  const s = window.__meshStudio.scene.getState();
  const o = s.objects[0];
  const g = o.geometry.clone();
  const p = g.getAttribute('position');
  for (const t of [0, 3, 7]) for (let k = 0; k < 3; k++) { const x = p.getComponent(t * 3 + 1, k); p.setComponent(t * 3 + 1, k, p.getComponent(t * 3 + 2, k)); p.setComponent(t * 3 + 2, k, x); }
  s.updateObject('break', o.id, { geometry: g });
});
a = await analyze();
ok(!a.manifold, 'three flipped triangles make the box non-manifold');
await page.getByRole('button', { name: 'Fix normals' }).click();
await settle(page);
a = await analyze();
ok(a.manifold && Math.abs(a.volume - 8000) < 0.5, 'fix normals restores a watertight 8000 mm³ box');
ok(/Flipped 3 triangles/.test(await page.evaluate(() => JSON.stringify(window.__meshStudio.app.getState().status))), 'status: flipped 3 triangles');

// ---------- merge overlapping shells ----------
await reset(page);
await prim('box', [20, 20, 20]);
await prim('box', [20, 20, 20]);
await move(1, [10, 0, 10]);
await move(0, [0, 0, 10]);
await selectIdx(0, 1);
await panel('Parts').getByRole('button', { name: 'Merge selected into one object' }).click();
a = await analyze();
ok(a.components === 2 && Math.abs(a.volume - 16000) < 1, 'overlapping boxes merged as 2 pieces (volume counted twice: 16000)');
await page.getByRole('button', { name: 'Merge overlaps' }).click();
await settle(page);
a = await analyze();
ok(a.manifold && a.components === 1 && Math.abs(a.volume - 12000) < 1, `merge overlaps → one solid of 12000 mm³ (${a.volume.toFixed(1)})`);

// ---------- auto orient for printing ----------
await reset(page);
await prim('box', [10, 20, 40]);
await tab('Paint');
await page.getByRole('button', { name: /Auto orient for printing/ }).click();
await settle(page);
let sz = await objectSize(page);
ok(Math.abs(sz[2] - 10) < 0.05 && (await objectBox(page)).min[2] === 0, 'tall box is laid on its largest face (height 10) ' + JSON.stringify(sz));
// mushroom: a wide cap on a thin post — orient flips it cap-down (no overhang under the cap)
await reset(page);
await prim('cylinder', [8, 8, 20]);
await prim('cylinder', [40, 40, 5]);
await move(1, [0, 0, 22.5]);
await move(0, [0, 0, 10]);
await selectIdx(0, 1);
await tab('Edit');
await page.locator('[data-panel="Booleans"]').getByRole('button', { name: /Union/ }).click();
await settle(page);
await tab('Paint');
await page.getByRole('button', { name: /Auto orient for printing/ }).click();
await settle(page);
box = await objectBox(page);
const lowWidth = await page.evaluate(() => {
  const o = window.__meshStudio.scene.getState().objects[0];
  const p = window.__meshStudio.geo.worldPositions(o);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < p.length; i += 3) if (p[i + 2] < 0.01) { lo = Math.min(lo, p[i]); hi = Math.max(hi, p[i]); }
  return hi - lo;
});
ok(Math.abs(lowWidth - 40) < 0.5, `mushroom is flipped onto its cap (bottom width ${lowWidth.toFixed(1)} mm)`);

// ---------- overhang shading ----------
await reset(page);
await prim('sphere', [40, 40, 40]);
await page.evaluate(() => window.__meshStudio.app.getState().requestCamera('bottom', 'selection'));
await page.waitForTimeout(400);
const red = async () => {
  const buf = await page.locator('[data-testid=viewport] canvas').screenshot();
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 120 && d[i] > d[i + 1] * 2.2 && d[i] > d[i + 2] * 2.2) n++;
    return n;
  }, buf.toString('base64'));
};
const red0 = await red();
await page.locator('#oh-show').click();
await page.waitForTimeout(300);
const red1 = await red();
ok(red1 > red0 + 500, `overhang shading tints the underside red (${red0} → ${red1} px)`);
await shot(page, 'p10-overhangs');
await setNum('#oh-angle', 60);
await page.waitForTimeout(300);
const red2 = await red();
ok(red2 > red1, `a larger threshold angle shows more overhang (${red1} → ${red2} px)`);
await page.locator('#oh-show').click();

// ---------- arrange / align / distribute ----------
await reset(page);
for (const s of [[30, 30, 10], [20, 40, 10], [10, 10, 10], [25, 15, 10]]) await prim('box', s);
await page.evaluate(() => {
  const s = window.__meshStudio.scene.getState();
  s.objects.forEach((o, i) => s.updateObject('pile', o.id, { position: [i * 3, i * 2, 5] }));
  s.clearSelection();
});
await tab('Scene');
await page.evaluate(() => window.__meshStudio.app.getState().setPanelOpen('Arrange / align', true));
await page.getByRole('button', { name: 'Arrange all objects' }).click();
const boxes = await page.evaluate(() => window.__meshStudio.scene.getState().objects.map((o) => { const b = window.__meshStudio.geo.worldBox(o); return [b.min.x, b.min.y, b.max.x, b.max.y, b.min.z]; }));
let overlap = false, minGap = Infinity;
for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
  const [a0, a1, a2, a3] = boxes[i], [b0, b1, b2, b3] = boxes[j];
  const gx = Math.max(b0 - a2, a0 - b2), gy = Math.max(b1 - a3, a1 - b3);
  if (gx < -1e-6 && gy < -1e-6) overlap = true;
  minGap = Math.min(minGap, Math.max(gx, gy));
}
ok(!overlap && minGap >= 6 - 1e-3 && boxes.every((b) => Math.abs(b[4]) < 1e-6), `arrange: no overlaps, ≥ 6 mm apart (min ${minGap.toFixed(2)}), all on the grid`);
await shot(page, 'p10-arrange');
await page.evaluate(() => window.__meshStudio.scene.getState().selectAll());
await page.getByRole('button', { name: 'Align Left' }).click();
const mins = await page.evaluate(() => window.__meshStudio.scene.getState().objects.map((o) => +window.__meshStudio.geo.worldBox(o).min.x.toFixed(4)));
ok(new Set(mins).size === 1, 'align left: equal min X ' + JSON.stringify(mins));
await page.getByRole('button', { name: 'Distribute Y' }).click();
const ys = await page.evaluate(() => window.__meshStudio.scene.getState().objects.map((o) => { const b = window.__meshStudio.geo.worldBox(o); return [b.min.y, b.max.y]; }).sort((p, q) => p[0] - q[0]));
const gaps = ys.slice(1).map((y, i) => y[0] - ys[i][1]);
ok(gaps.every((g) => Math.abs(g - gaps[0]) < 1e-3), 'distribute Y: equal gaps ' + JSON.stringify(gaps.map((g) => +g.toFixed(2))));
ok(!(await errorText(page)), 'no error banner');

await finish(browser, problems);
