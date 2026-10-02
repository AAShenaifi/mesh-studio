// Gap features, batch 5: text and SVG projected onto curved surfaces by clicking.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch, ok, reset, shot, finish, settle, errorText, FIX } from './harness.mjs';
import { makeFixtures } from './fixtures.mjs';

makeFixtures();
writeFileSync(join(FIX, 'square.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"><rect width="10" height="10" fill="#000"/></svg>');
const BASE_URL = process.argv[2] || 'http://localhost:5173/';
const { browser, page, problems } = await launch(BASE_URL);
const analyze = (idx = -1) => page.evaluate(async (idx) => window.__meshStudio.analyze(window.__meshStudio.scene.getState().objects.at(idx)), idx);
const prim = async (kind, size, segs = 128) => { await page.evaluate(({ kind, size, segs }) => window.__meshStudio.tools.addPrimitive(kind, size, segs, 0), { kind, size, segs }); await settle(page); };
const textPanel = () => page.locator('[data-panel="Add text"]');
const setNum = async (sel, v) => { await page.locator(sel).fill(String(v)); await page.locator(sel).press('Enter'); };
/** Radial distances (from the Z axis through the object centre) of vertices on triangles with colour `c`. */
const centreXY = () => page.evaluate(() => { const b = window.__meshStudio.geo.worldBox(window.__meshStudio.scene.getState().objects[0]); return [(b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2]; });
let centre = [0, 0];
const radial = (c) => page.evaluate(({ c, centre }) => {
  const o = window.__meshStudio.scene.getState().objects[0];
  const [cx, cy] = centre;
  const p = window.__meshStudio.geo.worldPositions(o);
  let lo = Infinity, hi = -Infinity, n = 0;
  for (let t = 0; t < o.faceColors.length; t++) {
    if (o.faceColors[t] !== c) continue;
    n++;
    for (let k = 0; k < 3; k++) { const r = Math.hypot(p[t * 9 + k * 3] - cx, p[t * 9 + k * 3 + 1] - cy); lo = Math.min(lo, r); hi = Math.max(hi, r); }
  }
  return { lo, hi, n };
}, { c, centre });
const clickCentre = async (dx = 0, dy = 0) => {
  const cb = await page.locator('[data-testid=viewport] canvas').boundingBox();
  await page.mouse.click(cb.x + cb.width / 2 + dx, cb.y + cb.height / 2 + dy);
};

// ---------- emboss text on the side of a cylinder ----------
await prim('cylinder', [40, 40, 40]);
let before = await analyze();
centre = await centreXY();
await page.getByRole('tab', { name: 'Edit' }).click();
await page.evaluate(() => window.__meshStudio.app.getState().setPanelOpen('Add text', true));
await textPanel().getByRole('radio', { name: 'On surface' }).click();
await textPanel().getByRole('textbox', { name: 'Text', exact: true }).fill('AB');
await setNum('#tx-size', 10);
await textPanel().getByRole('radio', { name: 'Emboss' }).click();
await setNum('#tx-depth', 1);
await textPanel().locator('#tx-color').selectOption('3');
await textPanel().getByRole('button', { name: /Place text on surface/ }).click();
await page.evaluate(() => window.__meshStudio.app.getState().requestCamera('front', 'selection'));
await page.waitForTimeout(500);
await clickCentre();
await settle(page);
let a = await analyze();
let r = await radial(3);
ok(!(await errorText(page)) && a.manifold && a.volume > before.volume + 20, `embossed “AB” on the cylinder wall: watertight, +${(a.volume - before.volume).toFixed(1)} mm³`);
ok(r.n > 50 && r.lo > 18.9 && r.hi < 21.1 && r.hi > 20.9, `text follows the curve: coloured faces between r = ${r.lo.toFixed(2)} and ${r.hi.toFixed(2)} mm (flat text would reach 21.8)`);
await shot(page, 'p14-text-cylinder');
ok((await page.evaluate(() => window.__meshStudio.scene.getState().past.length)) >= 1, 'placing text is an undo step');
await page.keyboard.press('Control+z');
ok(Math.abs((await analyze()).volume - before.volume) < 1e-6, 'undo removes the text');

// ---------- engrave on a sphere ----------
await reset(page);
await prim('sphere', [40, 40, 40], 96);
before = await analyze();
await page.evaluate(() => window.__meshStudio.app.getState().setPanelOpen('Add text', true));
await textPanel().getByRole('radio', { name: 'Engrave' }).click();
await setNum('#tx-depth', 0.8);
await textPanel().locator('#tx-color').selectOption('-1');
await textPanel().getByRole('button', { name: /Place text on surface/ }).click();
await page.evaluate(() => window.__meshStudio.app.getState().requestCamera('front', 'selection'));
await page.waitForTimeout(500);
await clickCentre();
await settle(page);
a = await analyze();
const depthOk = await page.evaluate(() => {
  const o = window.__meshStudio.scene.getState().objects[0];
  const b = window.__meshStudio.geo.worldBox(o);
  const c = [(b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2];
  const p = window.__meshStudio.geo.worldPositions(o);
  let lo = Infinity;
  for (let i = 0; i < p.length; i += 3) lo = Math.min(lo, Math.hypot(p[i] - c[0], p[i + 1] - c[1], p[i + 2] - c[2]));
  return lo;
});
ok(a.manifold && a.volume < before.volume - 5, `engraved on the sphere: watertight, −${(before.volume - a.volume).toFixed(1)} mm³`);
ok(depthOk > 20 - 0.8 - 0.25 && depthOk < 19.6, `engraving keeps a constant depth under the curve (deepest point r = ${depthOk.toFixed(2)})`);

// ---------- SVG on a cylinder ----------
await reset(page);
await prim('cylinder', [40, 40, 40]);
before = await analyze();
centre = await centreXY();
await page.evaluate(() => window.__meshStudio.app.getState().setPanelOpen('Add text', true));
await textPanel().getByRole('radio', { name: 'SVG' }).click();
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), textPanel().getByRole('button', { name: /Choose an SVG file/ }).click()]);
await chooser.setFiles(join(FIX, 'square.svg'));
await page.waitForTimeout(200);
await setNum('#tx-svgw', 10);
await textPanel().getByRole('radio', { name: 'Emboss' }).click();
await setNum('#tx-depth', 1);
await textPanel().locator('#tx-color').selectOption('5');
await textPanel().getByRole('button', { name: /Place SVG on surface/ }).click();
await page.evaluate(() => window.__meshStudio.app.getState().requestCamera('front', 'selection'));
await page.waitForTimeout(500);
await clickCentre();
await settle(page);
a = await analyze();
r = await radial(5);
ok(a.manifold && Math.abs(a.volume - before.volume - 100) < 12, `10 × 10 mm SVG square embossed 1 mm: +${(a.volume - before.volume).toFixed(1)} mm³ (≈ 100)`);
ok(r.hi < 21.1 && r.hi > 20.9, `SVG wraps the wall (outer r ${r.hi.toFixed(2)} mm)`);
await shot(page, 'p14-svg-cylinder');

await finish(browser, problems);
