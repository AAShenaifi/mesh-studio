// Phase 4: primitives, booleans (union/subtract/intersect), hollow.
import { launch, ok, sceneState, objectSize, errorText, dismissError, reset, shot, finish, settle } from './harness.mjs';

const BASE_URL = process.argv[2] || 'http://localhost:5173/';
const { browser, page, problems } = await launch(BASE_URL);
const analyze = (idx = -1) => page.evaluate(async (idx) => window.__meshStudio.analyze(window.__meshStudio.scene.getState().objects.at(idx)), idx);
const tab = (name) => page.getByRole('tab', { name }).click();
const near = (a, b, eps = 0.05) => a.every((v, i) => Math.abs(v - b[i]) <= eps);
const panel = (t) => page.locator(`[data-panel="${t}"]`);
const setNum = async (sel, v) => { await page.locator(sel).fill(String(v)); await page.locator(sel).press('Enter'); };

// ---------- primitives ----------
await tab('Create');
const P = panel('Primitives');
await setNum('#pr-x', 30); await setNum('#pr-y', 30); await setNum('#pr-z', 30);
await P.getByRole('button', { name: 'Add box' }).click(); await settle(page);
ok(near(await objectSize(page), [30, 30, 30]), 'box 30³');
let a = await analyze(); ok(a.manifold && Math.abs(a.volume - 27000) < 0.01, 'box watertight, 27000 mm³');
await P.getByRole('radio', { name: 'Cylinder' }).click();
await setNum('#pr-x', 10); await setNum('#pr-z', 40);
await P.getByRole('button', { name: 'Colour #ef6b73' }).click();
await P.getByRole('button', { name: 'Add cylinder' }).click(); await settle(page);
ok(near(await objectSize(page), [10, 10, 40], 0.01), 'cylinder Ø10 × 40');
await P.getByRole('radio', { name: 'Sphere' }).click();
await setNum('#pr-x', 20);
await P.getByRole('button', { name: 'Add sphere' }).click(); await settle(page);
a = await analyze(); ok(near(await objectSize(page), [20, 20, 20], 0.05) && a.manifold && Math.abs(a.volume - 4188.8) < 60, 'sphere Ø20');
await P.getByRole('radio', { name: 'Cone' }).click();
await setNum('#pr-y', 0);
await P.getByRole('button', { name: 'Add cone' }).click(); await settle(page);
a = await analyze(); ok(a.manifold && near(await objectSize(page), [20, 20, 40], 0.05), 'cone watertight');
const st = await sceneState(page);
ok(st.objects.every((o) => o.position[2] >= 0) && new Set(st.objects.map((o) => o.position[0])).size === 4, 'primitives placed side by side on the grid');
await shot(page, 'p4-primitives');

// ---------- booleans: box minus red cylinder ----------
await page.evaluate(() => {
  const s = window.__meshStudio.scene.getState();
  const [box, cyl] = s.objects;
  // move the cylinder into the box centre, poking out top and bottom
  s.apply('setup', { objects: s.objects.filter((o) => o === box || o === cyl).map((o) => (o === cyl ? { ...o, position: [box.position[0], box.position[1], 15] } : o)), selectedIds: [box.id, cyl.id] });
});
await tab('Edit');

await page.waitForSelector('[data-testid=boolean-panel]');
ok((await page.textContent('[data-testid=boolean-panel]')).includes('target'), 'boolean panel lists target and tool');
await panel('Booleans').getByRole('button', { name: 'Subtract' }).click(); await settle(page);
let s1 = await sceneState(page);
a = await analyze();
ok(s1.objects.length === 1 && a.manifold && a.genus === 1, 'subtract → one watertight object with a through hole');
ok(Math.abs(a.volume - (27000 - Math.PI * 25 * 30)) < 30, 'subtract volume ≈ 27000 − π·5²·30: ' + a.volume.toFixed(0));
const cols = await page.evaluate(() => { const s = window.__meshStudio.scene.getState(); return [...new Set(s.objects[0].faceColors)].map((c) => s.palette[c]).sort(); });
ok(cols.includes('#ef6b73') && cols.includes('#b58fd0'), 'hole walls keep the cutter colour: ' + JSON.stringify(cols));
await shot(page, 'p4-subtract');
await page.keyboard.press('Control+z');
ok((await sceneState(page)).objects.length === 2, 'undo boolean restores both');
await page.locator('#bool-keep').click();
await panel('Booleans').getByRole('button', { name: 'Subtract' }).click(); await settle(page);
ok((await sceneState(page)).objects.length === 2, 'keep tool objects leaves the cylinder');
await page.keyboard.press('Control+z');
await page.locator('#bool-keep').click();
await panel('Booleans').getByRole('button', { name: 'Union' }).click(); await settle(page);
a = await analyze();
ok(a.manifold && Math.abs(a.volume - (27000 + Math.PI * 25 * 10)) < 30, 'union volume ≈ box + protruding cylinder: ' + a.volume.toFixed(0));
await page.keyboard.press('Control+z');
await panel('Booleans').getByRole('button', { name: 'Intersect' }).click(); await settle(page);
a = await analyze();
ok(a.manifold && Math.abs(a.volume - Math.PI * 25 * 30) < 30, 'intersect volume ≈ π·5²·30');
await page.keyboard.press('Control+z');
// non-overlapping intersect
await page.evaluate(() => {
  const s = window.__meshStudio.scene.getState();
  s.apply('apart', { objects: s.objects.map((o, i) => (i === 1 ? { ...o, position: [o.position[0] + 100, o.position[1], o.position[2]] } : o)) });
});
await panel('Booleans').getByRole('button', { name: 'Intersect' }).click(); await settle(page);
ok(/do not overlap/.test((await errorText(page)) || ''), 'non-overlapping intersect → clear error');
await dismissError(page);

// ---------- hollow ----------
await reset(page);
await tab('Create');
await P.getByRole('radio', { name: 'Box' }).click();
await setNum('#pr-x', 30); await setNum('#pr-y', 30); await setNum('#pr-z', 30);
await P.getByRole('button', { name: 'Add box' }).click(); await settle(page);
await tab('Edit');
await panel('Hollow').locator('summary').click();
await panel('Hollow').getByRole('button', { name: 'Hollow' }).click(); await settle(page, 120000);
a = await analyze();
const expected = 27000 - 26 ** 3;
ok(a.manifold && a.components === 2, 'hollow box: watertight outer + inner shell');
ok(Math.abs(a.volume - expected) / expected < 0.06, `hollow volume ≈ ${expected} mm³: ${a.volume.toFixed(0)}`);
ok(near(await objectSize(page), [30, 30, 30], 0.01), 'outer size unchanged');
await page.keyboard.press('Control+z');
await page.locator('#ho-drain').click();
await panel('Hollow').getByRole('button', { name: 'Hollow' }).click(); await settle(page, 120000);
a = await analyze();
ok(a.manifold && a.components === 1, 'drain hole connects cavity to outside (one piece)');
await shot(page, 'p4-hollow');
// sphere hollow (curved surface)
await reset(page);
await tab('Create');
await P.getByRole('radio', { name: 'Sphere' }).click();
await setNum('#pr-x', 40);
await P.getByRole('button', { name: 'Add sphere' }).click(); await settle(page);
await tab('Edit');
await setNum('#ho-t', 3);
await panel('Hollow').getByRole('button', { name: 'Hollow' }).click(); await settle(page, 120000);
a = await analyze();
const sph = (4 / 3) * Math.PI * (20 ** 3 - 17 ** 3);
ok(a.manifold && a.components === 2 && Math.abs(a.volume - sph) / sph < 0.08, `hollow sphere ≈ ${sph.toFixed(0)}: ${a.volume.toFixed(0)}`);

await finish(browser, problems);
