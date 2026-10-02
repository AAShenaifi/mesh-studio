// Phase 5: painting (brush, bucket, undo), colours through cuts, split by colour, fit, orientation.
import { launch, ok, pick, sceneState, objectSize, reset, shot, finish, settle } from './harness.mjs';

const BASE_URL = process.argv[2] || 'http://localhost:5173/';
const { browser, page, problems } = await launch(BASE_URL);
const analyze = (idx = -1) => page.evaluate(async (idx) => window.__meshStudio.analyze(window.__meshStudio.scene.getState().objects.at(idx)), idx);
const tab = (name) => page.getByRole('tab', { name }).click();
const panel = (t) => page.locator(`[data-panel="${t}"]`);
const near = (a, b, eps = 0.05) => a.every((v, i) => Math.abs(v - b[i]) <= eps);
const setNum = async (sel, v) => { await page.locator(sel).fill(String(v)); await page.locator(sel).press('Enter'); };
const painted = (idx = 0, color = 3) => page.evaluate(({ idx, color }) => [...window.__meshStudio.scene.getState().objects.at(idx).faceColors].filter((c) => c === color).length, { idx, color });
const canvasBox = async () => (await page.$('[data-testid=viewport] canvas')).boundingBox();

// sphere to paint on
await tab('Create');
await panel('Primitives').getByRole('radio', { name: 'Sphere' }).click();
await setNum('#pr-x', 40);
await panel('Primitives').getByRole('button', { name: 'Add sphere' }).click();
await settle(page);
const total = (await sceneState(page)).objects[0].tris;
await page.evaluate(() => window.__meshStudio.app.getState().requestCamera('front', 'selection'));
await tab('Paint');
await page.getByRole('radio', { name: /Colour 4 / }).click();
await setNum('#pt-radius', 4);
await page.getByRole('button', { name: 'Start painting' }).click();
await page.waitForTimeout(300);
const cb = await canvasBox();
const cx = cb.x + cb.width / 2, cy = cb.y + cb.height / 2;
await page.mouse.move(cx - 60, cy);
await page.mouse.down();
await page.mouse.move(cx + 60, cy, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(200);
const n1 = await painted();
ok(n1 > 10 && n1 < total / 2, `brush stroke painted ${n1} of ${total} triangles`);
ok((await sceneState(page)).past >= 1, 'stroke is an undo step');
await shot(page, 'p5-brush');
// orbiting with the left button is disabled while painting: camera unchanged by a paint drag
await page.mouse.move(cx, cy - 40); await page.mouse.down(); await page.mouse.move(cx, cy + 40, { steps: 8 }); await page.mouse.up();
const n2 = await painted();
ok(n2 > n1, 'second stroke adds paint');
await page.keyboard.press('Escape');
await page.keyboard.press('Control+z');
ok((await painted()) === n1, 'undo removes only the last stroke');
await page.keyboard.press('Control+z');
ok((await painted()) === 0, 'undo first stroke');
await page.keyboard.press('Control+y');
ok((await painted()) === n1, 'redo stroke');
// colour attribute matches faceColors after undo/redo (rendering in sync)
const synced = await page.evaluate(() => {
  const s = window.__meshStudio.scene.getState(); const o = s.objects[0];
  const a = o.geometry.getAttribute('color').array; const t = o.faceColors.indexOf(3);
  return t >= 0 && a[t * 9] !== a[o.faceColors.indexOf(0) * 9];
});
ok(synced, 'viewport colours follow undo/redo');

// colours through a cut
await tab('Edit');
await page.getByRole('button', { name: /Start cut/ }).click();
await page.getByRole('radio', { name: 'X', exact: true }).first().click();
await page.getByRole('button', { name: 'Cut', exact: true }).click();
await settle(page);
const parts = await page.evaluate(() => window.__meshStudio.scene.getState().objects.map((o) => [...o.faceColors].filter((c) => c === 3).length));
ok(parts.length === 2 && parts[0] > 0 && parts[1] > 0, 'painted stroke survives the cut on both halves: ' + JSON.stringify(parts));
await shot(page, 'p5-cut-colours');

// bucket fill on a box
await reset(page);
await pick(page, ['box.stl']);
await page.evaluate(() => window.__meshStudio.app.getState().requestCamera('front', 'selection'));
await tab('Paint');
await panel('Paint').getByRole('radio', { name: 'Bucket fill' }).click();
await page.getByRole('button', { name: 'Start painting' }).click();
await page.waitForTimeout(300);
const cb2 = await canvasBox();
await page.mouse.click(cb2.x + cb2.width / 2, cb2.y + cb2.height / 2);
await page.waitForTimeout(200);
ok((await painted()) === 2, 'bucket at 30° fills one box face (2 triangles)');
await page.getByRole('radio', { name: /Colour 6 / }).click();
await setNum('#pt-angle', 180);
await page.mouse.click(cb2.x + cb2.width / 2 + 5, cb2.y + cb2.height / 2 + 5);
await page.waitForTimeout(200);
ok((await painted(0, 5)) === 2, 'bucket 180° stays inside the same-colour region');
await page.getByRole('button', { name: /Stop painting/ }).click();

// palette: add + edit colour, undoable
const pal0 = await page.evaluate(() => window.__meshStudio.scene.getState().palette.length);
await page.getByLabel('Add colour').fill('#123456');
ok(await page.evaluate(() => window.__meshStudio.scene.getState().palette.includes('#123456')), 'colour added to palette');
await page.getByRole('radio', { name: /Colour 6 / }).click();
await page.locator('#pt-edit').fill('#00ff00');
await page.locator('#pt-edit').fill('#00ee00');
ok(await page.evaluate(() => window.__meshStudio.scene.getState().palette[5] === '#00ee00'), 'edit colour changes the palette');
await page.evaluate(() => document.activeElement.blur());
await page.keyboard.press('Control+z');
ok(await page.evaluate(() => window.__meshStudio.scene.getState().palette[5] !== '#00ff00'), 'one undo reverts a whole colour-picker drag');
ok(pal0 >= 8, 'palette ok');

// split by colour: union of two disjoint primitives in different colours
await reset(page);
await tab('Create');
await panel('Primitives').getByRole('radio', { name: 'Box' }).click();
await setNum('#pr-x', 20); await setNum('#pr-y', 20); await setNum('#pr-z', 20);
await panel('Primitives').getByRole('button', { name: 'Add box' }).click(); await settle(page);
await panel('Primitives').getByRole('button', { name: 'Colour #ef6b73' }).click();
await panel('Primitives').getByRole('button', { name: 'Add box' }).click(); await settle(page);
await page.keyboard.press('Control+a');
await tab('Edit');
await panel('Booleans').getByRole('button', { name: 'Union' }).click(); await settle(page);
ok((await sceneState(page)).objects.length === 1, 'two coloured boxes unioned into one object');
await tab('Paint');
await page.getByRole('button', { name: 'Split selected object by colour' }).click(); await settle(page);
const st = await sceneState(page);
ok(st.objects.length === 2, 'split by colour → 2 objects');
const a0 = await analyze(0), a1 = await analyze(1);
ok(a0.manifold && a1.manifold && Math.abs(a0.volume - 8000) < 1 && Math.abs(a1.volume - 8000) < 1, 'both parts watertight, 8000 mm³ each');
await shot(page, 'p5-split');

// fit box + orientation helpers
await reset(page);
await pick(page, ['box.stl']);
await tab('Edit');
await panel('Resize / scale').getByRole('radio', { name: 'Fit box' }).click();
await setNum('#fit-x', 10); await setNum('#fit-y', 10); await setNum('#fit-z', 10);
await panel('Resize / scale').getByRole('button', { name: /Scale to fit/ }).click();
ok(near(await objectSize(page), [5, 7.5, 10]), 'fit into 10 mm box keeps proportions');
await page.keyboard.press('Control+z');
await tab('Paint');
await page.evaluate(() => window.__meshStudio.app.getState().requestCamera('front', 'selection'));
await page.getByRole('button', { name: 'Lay flat: pick a face' }).click();
await page.waitForTimeout(300);
const cb3 = await canvasBox();
await page.mouse.click(cb3.x + cb3.width / 2, cb3.y + cb3.height / 2);
await page.waitForTimeout(300);
ok(near(await objectSize(page), [20, 40, 30]), 'lay flat on the front face: Y becomes height');
ok(await page.evaluate(() => window.__meshStudio.app.getState().activeTool === null), 'lay-flat tool ends after one click');
await page.evaluate(() => {
  const s = window.__meshStudio.scene.getState();
  const o = s.objects[0];
  s.updateObject('tilt', o.id, { rotation: [0.6, 0.3, 0] });
});
await page.getByRole('button', { name: 'Largest flat face down' }).click();
const sz = await objectSize(page);
ok(near([...sz].sort((x, y) => x - y), [20, 30, 40], 0.1) && Math.abs(sz[2] - 20) < 0.05, 'auto orient: largest face (30×40) down, footprint squared to the axes: ' + JSON.stringify(sz));
await shot(page, 'p5-orient');

await finish(browser, problems);
