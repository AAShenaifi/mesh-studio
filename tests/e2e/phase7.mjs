// Phase 7: STEP import via OpenCascade (lazy worker, quality setting, assemblies, errors).
import { launch, ok, pick, drop, sceneState, objectSize, errorText, dismissError, reset, shot, finish, settle } from './harness.mjs';
import { makeStepFixtures } from './fixtures.mjs';

await makeStepFixtures();
const BASE_URL = process.argv[2] || 'http://localhost:5173/';
const { browser, page, problems } = await launch(BASE_URL);
const analyze = (idx = -1) => page.evaluate(async (idx) => window.__meshStudio.analyze(window.__meshStudio.scene.getState().objects.at(idx)), idx);
const near = (a, b, eps = 0.05) => a.every((v, i) => Math.abs(v - b[i]) <= eps);

// lazy: no OpenCascade request before the first CAD file
const wasmRequests = [];
page.on('request', (r) => { if (/occt-import-js.*\.wasm|step\.worker/.test(r.url())) wasmRequests.push(r.url()); });
await pick(page, ['box.stl']);
ok(wasmRequests.length === 0, 'OpenCascade is not loaded until a CAD file is opened');
await reset(page);

await pick(page, ['red_box.step']);
await settle(page, 120000);
ok(wasmRequests.some((u) => u.endsWith('.wasm')), 'OpenCascade Wasm loaded from this origin on demand');
let st = await sceneState(page);
ok(st.objects.length === 1 && st.objects[0].name === 'red_box', 'STEP box imported as one object');
ok(near(await objectSize(page), [20, 30, 40], 0.001), 'STEP box size 20 × 30 × 40 mm');
const color = await page.evaluate(() => { const s = window.__meshStudio.scene.getState(); return s.palette[s.objects[0].faceColors[0]]; });
ok(color === '#ff0000', 'STEP colour imported: ' + color);
let a = await analyze();
ok(a.manifold && Math.abs(a.volume - 24000) < 0.01, 'STEP solid is watertight (24000 mm³)');
ok(Math.abs((await page.evaluate(() => window.__meshStudio.geo.worldBox(window.__meshStudio.scene.getState().objects[0]).min.z))) < 1e-6, 'placed on the grid');

// quality setting: draft vs fine
const tris = {};
for (const q of ['draft', 'fine']) {
  await reset(page);
  await page.evaluate((q) => window.__meshStudio.settings.getState().update({ stepQuality: q }), q);
  await drop(page, ['cylinder.stp']);
  await settle(page, 120000);
  st = await sceneState(page);
  tris[q] = st.objects[0].tris;
  a = await analyze();
  ok(a.manifold && near(await objectSize(page), [20, 20, 30], 0.2), `${q}: watertight cylinder Ø20 × 30 (${tris[q]} triangles)`);
}
ok(tris.fine > tris.draft * 2, `fine quality uses more triangles (${tris.draft} → ${tris.fine})`);
// settings UI exposes the option
await page.getByRole('button', { name: 'Settings' }).click();
ok(await page.locator('#set-stepq').isVisible(), 'tessellation quality in Settings');
await page.locator('#set-stepq').selectOption('normal');
await page.getByRole('button', { name: 'Done' }).click();

// assembly: per part (placement kept) vs merged
await reset(page);
await drop(page, ['pair.step']);
await settle(page, 120000);
st = await sceneState(page);
ok(st.objects.length === 2, 'two solids → two objects');
const boxes = await page.evaluate(() => window.__meshStudio.scene.getState().objects.map((o) => { const b = window.__meshStudio.geo.worldBox(o); return [b.min.x, b.min.z, b.max.x - b.min.x, b.max.z - b.min.z]; }));
ok(Math.abs(boxes[1][0] - boxes[0][0] - 30) < 1e-4 && Math.abs(boxes[1][1] - boxes[0][1] - 5) < 1e-4, 'relative placement of parts kept (30 mm apart, 5 mm higher)');
ok(Math.min(boxes[0][1], boxes[1][1]) === 0, 'assembly as a whole rests on the grid');
await reset(page);
await page.evaluate(() => window.__meshStudio.settings.getState().update({ stepPerPart: false }));
await drop(page, ['pair.step']);
await settle(page, 120000);
ok((await sceneState(page)).objects.length === 1 && (await sceneState(page)).objects[0].tris === 24, 'merged mode → one object');
await page.evaluate(() => window.__meshStudio.settings.getState().reset());

// broken file → visible error
await reset(page);
await drop(page, ['broken.step']);
await settle(page, 120000);
ok(/could not read|no solid/i.test((await errorText(page)) || ''), 'broken STEP → clear error: ' + (await errorText(page)));
await dismissError(page);
await pick(page, ['red_box.step']);
await settle(page, 120000);
ok((await sceneState(page)).objects.length === 1, 'worker still works after a failed file');
await shot(page, 'p7-step');

await finish(browser, problems);
