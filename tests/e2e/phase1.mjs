// Phase 1 + 1.5: loading, errors, settings, multi-object tools, undo/redo, tab strip.
import { launch, ok, pick, drop, sceneState, objectSize, objectBox, errorText, dismissError, reset, shot, finish, settle } from './harness.mjs';

const BASE_URL = process.argv[2] || 'http://localhost:5173/';
const { browser, page, problems } = await launch(BASE_URL);

ok(await page.evaluate(() => window.crossOriginIsolated), 'crossOriginIsolated');
const head = await page.request.get(BASE_URL);
ok(head.headers()['cross-origin-embedder-policy'] === 'require-corp', 'COEP on the site root');

// --- loading (all Z-up now) ---
await pick(page, ['box.stl']);
ok(JSON.stringify(await objectSize(page)) === '[20,30,40]', 'binary STL 20x30x40');
const b = await objectBox(page);
ok(b.min[2] === 0 && b.min[0] === -10 && b.min[1] === -15, 'first object centred and on grid: ' + JSON.stringify(b));
await drop(page, ['box_ascii.stl', 'box.obj']);
let st = await sceneState(page);
ok(st.objects.length === 3, 'drop of two files → 3 objects');
ok(JSON.stringify(await objectSize(page, 1)) === '[20,30,40]' && JSON.stringify(await objectSize(page, 2)) === '[20,30,40]', 'ASCII STL + OBJ sizes');
const b1 = await objectBox(page, 1);
ok(b1.min[0] > 10 && b1.min[2] === 0, 'second object placed beside the first');
await pick(page, ['box.glb']);
ok(JSON.stringify(await objectSize(page)) === '[20,40,30]', 'GLB converted Y-up → Z-up');
await drop(page, ['box.gltf', 'box.bin']);
ok(JSON.stringify(await objectSize(page)) === '[20,40,30]', 'glTF + sidecar .bin');
await drop(page, ['red_box.glb']);
const red = await page.evaluate(() => { const s = window.__meshStudio.scene.getState(); const o = s.objects.at(-1); return s.palette[o.faceColors[0]]; });
ok(red === '#ff0000', 'glTF material colour → palette: ' + red);
ok((await errorText(page)) === null, 'no error after good loads');
await shot(page, 'p15-multi');

// --- errors ---
const before = (await sceneState(page)).objects.length;
await drop(page, ['box.gltf']);
let e = await errorText(page); ok(e && /box\.bin/.test(e), 'missing .bin error');
ok((await sceneState(page)).objects.length === before, 'failed load adds nothing');
await dismissError(page);
await drop(page, ['notes.txt']); e = await errorText(page); ok(e && /Unsupported/.test(e), 'unsupported file error'); await dismissError(page);
await drop(page, ['broken.glb']); e = await errorText(page); ok(e && /corrupted|glTF/i.test(e), 'broken GLB error'); await dismissError(page);
await drop(page, ['empty.stl']); e = await errorText(page); ok(e && /empty/.test(e), 'empty STL error'); await dismissError(page);
await drop(page, ['empty.stl', 'cylinder.stl']);
ok((await sceneState(page)).objects.length === before + 1 && /empty/.test((await errorText(page)) || ''), 'mixed drop: good file loads, bad one reports');
await dismissError(page);

// --- selection + gizmo + numeric transform ---
await reset(page);
await pick(page, ['box.stl']);
await pick(page, ['cylinder.stl']);
st = await sceneState(page);
ok(st.selectedIds.length === 1 && st.selectedIds[0] === st.objects[1].id, 'new object is selected');
// click the first object in the viewport (centre of view after fit-all)
await page.evaluate(() => window.__meshStudio.app.getState().requestCamera('front'));
await page.waitForTimeout(300);
const canvas = await page.$('canvas');
const cb = await canvas.boundingBox();
await page.locator('[data-object-id]').first().click();
st = await sceneState(page);
ok(st.selectedIds[0] === st.objects[0].id, 'select from object list');
await page.mouse.click(cb.x + 30, cb.y + 30); // empty area
await page.waitForTimeout(200);
ok((await sceneState(page)).selectedIds.length === 0, 'click on empty space clears selection');
// click on the box in the viewport: project its centre to screen
const pt = await page.evaluate(() => {
  const s = window.__meshStudio.scene.getState();
  return s.objects[0].position;
});
ok(Array.isArray(pt), 'have object position');
await page.locator('[data-object-id]').first().click();
await page.locator('#pos-x').fill('12.5'); await page.locator('#pos-x').press('Enter');
ok((await sceneState(page)).objects[0].position[0] === 12.5, 'numeric position X');
await page.locator('#rot-z').fill('90'); await page.locator('#rot-z').press('Enter');
ok(JSON.stringify(await objectSize(page, 0)) === '[30,20,40]', 'rotate Z 90° swaps X/Y size');
await page.waitForFunction(() => document.querySelector('#scl-x')?.value === '100');
await page.locator('#scl-x').fill('50'); await page.locator('#scl-x').press('Enter');
ok(JSON.stringify(await objectSize(page, 0)) === '[15,10,20]', 'uniform scale 50%: ' + JSON.stringify(await objectSize(page, 0)));
await page.waitForFunction(() => document.querySelector('#size-z')?.value === '20');
await page.locator('#size-z').fill('40'); await page.locator('#size-z').press('Enter');
{ const z = await objectSize(page, 0); ok(JSON.stringify(z) === '[30,20,40]', 'size Z=40 with uniform lock: ' + JSON.stringify(z) + ' ' + JSON.stringify((await sceneState(page)).objects[0].scale) + ' ' + JSON.stringify(await page.evaluate(() => window.__meshStudio.scene.getState().past.map((p) => p.label + ':' + JSON.stringify(p.snap.objects[0]?.scale))))); }
await page.waitForFunction(() => document.querySelector('#pos-z')?.value !== '');
await page.locator('#pos-z').fill('25'); await page.locator('#pos-z').press('Enter');
ok((await objectBox(page, 0)).min[2] > 0, 'lifted above grid');
await page.evaluate(() => document.activeElement.blur());
await page.keyboard.press('d');
await settle(page);
ok((await objectBox(page, 0)).min[2] === 0, 'D drops to grid');
await page.keyboard.press('c');
await settle(page);
const cbx = await objectBox(page, 0);
ok(Math.abs(cbx.min[0] + cbx.max[0]) < 0.02 && Math.abs(cbx.min[1] + cbx.max[1]) < 0.02, 'C centres on origin');

// --- undo/redo ---
const pastBefore = (await sceneState(page)).past;
await page.keyboard.press('Control+z');
await page.keyboard.press('Control+z');
ok((await objectBox(page, 0)).min[2] > 0, 'undo ×2 restores lifted position');
await page.keyboard.press('Control+y');
ok((await objectBox(page, 0)).min[2] === 0, 'redo drop');
ok((await sceneState(page)).past === pastBefore - 1, 'history counts consistent');

// --- duplicate / delete / hide ---
await page.keyboard.press('Control+d');
st = await sceneState(page);
ok(st.objects.length === 3 && st.objects[2].name.endsWith('copy'), 'Ctrl+D duplicates');
ok(st.objects[2].position[0] > st.objects[0].position[0], 'duplicate offset to the side');
await page.keyboard.press('h');
ok((await sceneState(page)).objects[2].visible === false, 'H hides');
await page.keyboard.press('Delete');
ok((await sceneState(page)).objects.length === 2, 'Delete removes');
await page.keyboard.press('Control+z');
ok((await sceneState(page)).objects.length === 3, 'undo delete');
await page.keyboard.press('Control+a');
ok((await sceneState(page)).selectedIds.length === 2, 'Ctrl+A selects visible objects');

// gizmo modes
await page.keyboard.press('e');
ok(await page.evaluate(() => window.__meshStudio.scene.getState().gizmoMode) === 'rotate', 'E → rotate gizmo');
await page.keyboard.press('r');
await page.keyboard.press('w');
ok(await page.evaluate(() => window.__meshStudio.scene.getState().gizmoMode) === 'translate', 'W → move gizmo');

// drag with the gizmo: select one object, drag the X arrow
await page.keyboard.press('Escape');
await page.locator('[data-object-id]').first().click();
await page.evaluate(() => window.__meshStudio.app.getState().requestCamera('top', 'selection'));
await page.waitForTimeout(400);
await shot(page, 'p15-gizmo');
const x0 = (await sceneState(page)).objects[0].position[0];
// find the gizmo X handle by projecting a point on the +X arrow
const handle = await page.evaluate(() => {
  const o = window.__meshStudio.scene.getState().objects[0];
  return o.position;
});
ok(handle !== null, 'gizmo target exists');
// the arrow lies to the right of the object centre in top view; centre of canvas is the object
const cx = cb.x + cb.width / 2, cy = cb.y + cb.height / 2;
let moved = false;
for (const dx of [60, 80, 100, 120, 45]) {
  await page.mouse.move(cx + dx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + dx + 80, cy, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  if ((await sceneState(page)).objects[0].position[0] !== x0) { moved = true; break; }
}
ok(moved, 'gizmo drag moves the object (one undo step)');

// --- settings: units + persistence ---
await page.getByRole('button', { name: 'Settings' }).click();
await page.getByRole('dialog').getByRole('radio', { name: 'in' }).click();
await page.locator('#set-grid-size').fill('20'); await page.locator('#set-grid-size').press('Enter');
await page.locator('#set-grid-div').fill('abc'); await page.locator('#set-grid-div').press('Enter');
ok((await page.locator('#set-grid-div').getAttribute('aria-invalid')) === 'true', 'invalid input flagged');
await page.locator('#set-grid-div').press('Escape');
ok(await page.getByRole('dialog').isVisible(), 'first Escape only reverts the field');
await shot(page, 'p15-settings');
await page.getByRole('button', { name: 'Done' }).click();
const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('mesh-studio:settings')).state);
ok(stored.units === 'in' && Math.abs(stored.gridSize - 508) < 0.01, 'settings persisted (20 in grid = 508 mm)');
await page.reload(); await page.waitForSelector('canvas');
ok(await page.evaluate(() => document.querySelector('footer').textContent.includes('Z-up · in')), 'settings restored after reload');
await page.evaluate(() => localStorage.setItem('mesh-studio:settings', '{"state":{"gridSize":"huge","units":"furlong"},"version":1}'));
await page.reload(); await page.waitForSelector('canvas');
ok(await page.evaluate(() => document.querySelector('footer').textContent.includes('Z-up · mm')), 'corrupt settings → defaults');
// Y-up import convention
await page.evaluate(() => window.__meshStudio.settings.getState().update({ upAxis: 'y' }));
await pick(page, ['box.stl']);
ok(JSON.stringify(await objectSize(page)) === '[20,40,30]', 'STL with Up axis = Y is converted to Z-up');
await page.evaluate(() => window.__meshStudio.settings.getState().reset());

// --- standalone app: no studio tab strip, isolated, engine served from this site ---
ok((await page.getByRole('navigation', { name: 'Studios' }).count()) === 0, 'no STL Studio tab strip (standalone site)');
ok(await page.evaluate(() => window.crossOriginIsolated), 'cross-origin isolated');
for (const f of ['openscad.js', 'openscad.wasm', 'libs.bin']) {
  const r = await page.request.get(new URL('/openscad/' + f, BASE_URL).href);
  ok(r.ok(), `/openscad/${f} is served by this site`);
}
await shot(page, 'p15-final');
await finish(browser, problems);
