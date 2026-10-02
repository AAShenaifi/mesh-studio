// Phase 2: Manifold worker, cut/split with pins, analysis, repair, export dialog + round trips.
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { launch, ok, pick, drop, sceneState, objectSize, errorText, dismissError, reset, shot, finish, settle } from './harness.mjs';

const BASE_URL = process.argv[2] || 'http://localhost:5173/';
const { browser, page, problems } = await launch(BASE_URL);
const DL = join(tmpdir(), 'mesh-studio-downloads');
mkdirSync(DL, { recursive: true });

const kernel = (op, idx, extra = {}) =>
  page.evaluate(async ({ op, idx, extra }) => {
    const s = window.__meshStudio.scene.getState();
    const o = s.objects.at(idx);
    const k = await import(/* @vite-ignore */ window.__meshStudio.kernelUrl);
    return k.kernel(op, { mesh: k.kernelMesh(o), ...extra });
  }, { op, idx, extra });
const analyze = (idx = -1) => page.evaluate(async (idx) => window.__meshStudio.analyze(window.__meshStudio.scene.getState().objects.at(idx)), idx);
const tab = async (name) => page.getByRole('tab', { name }).click();

// ---------- analysis ----------
await pick(page, ['box.stl']);
await tab('Edit');
await page.waitForSelector('[data-testid=analysis]');
ok((await page.textContent('[data-testid=an-volume]')) === '24.00 cm³', 'analysis volume 24 cm³');
ok((await page.textContent('[data-testid=an-surface-area]')) === '52.00 cm²', 'surface area 52 cm²');
ok((await page.textContent('[data-testid=an-watertight]')).startsWith('Yes'), 'watertight yes');

// ---------- cut along Z at the middle ----------
await page.getByRole('button', { name: /Start cut/ }).click();
await page.waitForSelector('[data-testid=cut-panel]');
await page.waitForTimeout(300);
await shot(page, 'p2-cut-plane');
await page.getByRole('button', { name: 'Cut', exact: true }).click();
await settle(page);
let st = await sceneState(page);
ok(st.objects.length === 2, 'cut → 2 objects');
ok(JSON.stringify(await objectSize(page, 0)) === '[20,30,20]' && JSON.stringify(await objectSize(page, 1)) === '[20,30,20]', 'halves 20x30x20');
let a0 = await analyze(0), a1 = await analyze(1);
ok(a0.manifold && a1.manifold, 'both halves watertight');
ok(Math.abs(Math.abs(a0.volume) + Math.abs(a1.volume) - 24000) < 0.5, 'volumes add up to 24000 mm³');
await shot(page, 'p2-cut-done');
await page.keyboard.press('Control+z');
ok((await sceneState(page)).objects.length === 1, 'undo cut');
await page.keyboard.press('Control+y');
ok((await sceneState(page)).objects.length === 2, 'redo cut');

// ---------- cut with pins + gap + lay flat on a cylinder ----------
await reset(page);
await pick(page, ['cylinder.stl']);
await page.getByRole('button', { name: /Start cut/ }).click();
await page.getByRole('radio', { name: 'Dowel' }).click();
await page.getByRole('radio', { name: '2', exact: true }).click();
await page.locator('#cut-gap').fill('6'); await page.locator('#cut-gap').press('Enter');
await page.locator('#cut-flat').click();
await page.getByRole('button', { name: 'Cut', exact: true }).click();
await settle(page);
st = await sceneState(page);
ok(st.objects.length === 4, 'cylinder cut with 2 pins → 2 halves + 2 pins: ' + st.objects.length);
a0 = await analyze(0); a1 = await analyze(1);
ok(a0.manifold && a1.manifold && a0.genus === 0, 'halves watertight with blind pin holes');
const full = Math.PI * 100 * 30;
ok(Math.abs(a0.volume) + Math.abs(a1.volume) < full - 2 * Math.PI * 2.15 ** 2 * 5 * 2 * 0.9, 'pin holes removed material');
const pinSize = await objectSize(page, 2);
ok(Math.abs(pinSize[0] - 4) < 0.1 && Math.abs(pinSize[2] - 10) < 0.1, 'dowel is Ø4 × 10 mm (holes 0.1 mm deeper): ' + JSON.stringify(pinSize));
const pinX = await page.evaluate(() => window.__meshStudio.scene.getState().objects.slice(2).map((o) => o.position[0]));
ok(Math.abs(pinX[0] - pinX[1]) > 4, 'the two pins do not overlap');
const flat = await page.evaluate(() => window.__meshStudio.scene.getState().objects.slice(0, 2).map((o) => window.__meshStudio.geo.worldBox(o).min.z));
ok(flat.every((z) => Math.abs(z) < 1e-3), 'lay flat puts halves on the grid');
await shot(page, 'p2-pins');

// ---------- tilted cut + colours preserved ----------
await reset(page);
await pick(page, ['box.stl']);
await page.evaluate(() => {
  const s = window.__meshStudio.scene.getState();
  const o = s.objects[0];
  const fc = o.faceColors.slice();
  fc.fill(3, 0, 4); // paint first 4 triangles red
  s.updateObject('paint', o.id, { faceColors: fc });
  s.apply('palette', { palette: [...s.palette] });
});
await page.getByRole('button', { name: /Start cut/ }).click();
await page.evaluate(() => {
  const q = [Math.sin(Math.PI / 16), 0, 0, Math.cos(Math.PI / 16)]; // 22.5° about X
  const c = window.__meshStudio.cut.getState();
  c.set({ quaternion: q, gap: 0, layFlat: false, connectors: { ...c.connectors, type: 'none' } });
});
ok((await page.getByRole('radio', { name: 'Tilted' }).count()) === 1, 'tilted plane shown as custom');
await page.getByRole('button', { name: 'Cut', exact: true }).click();
await settle(page);
st = await sceneState(page);
ok(st.objects.length === 2, 'tilted cut → 2 objects');
const colors = await page.evaluate(() => window.__meshStudio.scene.getState().objects.map((o) => [...new Set(o.faceColors)].sort()));
ok(colors.some((c) => c.includes(3)) && colors.every((c) => c.every((i) => i === 0 || i === 3)), 'painted colour survives the cut, caps use object colour: ' + JSON.stringify(colors));
a0 = await analyze(0); a1 = await analyze(1);
ok(a0.manifold && a1.manifold && Math.abs(Math.abs(a0.volume) + Math.abs(a1.volume) - 24000) < 0.5, 'tilted halves watertight, volume conserved');

// ---------- repair + non-watertight cut error ----------
await reset(page);
await pick(page, ['open_box.stl']);
await page.waitForSelector('[data-testid=an-open-edges]');
ok((await page.textContent('[data-testid=an-watertight]')) === 'No', 'open box detected as not watertight');
ok((await page.textContent('[data-testid=an-open-edges]')) === '4', 'open box has 4 open edges');
await page.getByRole('button', { name: /Start cut/ }).click();
await page.getByRole('button', { name: 'Cut', exact: true }).click();
await settle(page);
const err = await errorText(page);
ok(err && /not watertight/.test(err) && /Repair/.test(err), 'cut on open mesh explains the problem');
await dismissError(page);
await page.keyboard.press('Escape');
await page.getByRole('button', { name: /^Repair/ }).click();
await settle(page);
await page.waitForSelector('[data-testid=an-watertight]');
await page.waitForFunction(() => document.querySelector('[data-testid=an-watertight]')?.textContent.startsWith('Yes'), null, { timeout: 10000 }).catch(() => {});
ok((await page.textContent('[data-testid=an-watertight]')).startsWith('Yes'), 'repair fills the hole');
ok((await page.textContent('[data-testid=an-volume]')) === '24.00 cm³', 'repaired volume 24 cm³');
ok(/filled 1 hole/.test(await page.textContent('[data-testid=status-text]')), 'repair report in status bar');
await page.keyboard.press('Control+z');
await page.waitForSelector('[data-testid=an-open-edges]');
ok(true, 'undo repair restores the open mesh');

// ---------- export dialog + round trips ----------
async function exportVia(opts) {
  await page.keyboard.press('Control+e');
  await page.waitForSelector('#ex-format');
  await page.selectOption('#ex-format', opts.format);
  if (opts.scope) await page.getByRole('dialog').getByRole('radio', { name: opts.scope }).click();
  await page.getByRole('dialog').getByRole('radio', { name: opts.units ?? 'mm', exact: true }).click();
  if (opts.format !== 'glb') await page.getByRole('dialog').getByRole('radio', { name: opts.up ?? 'Z-up' }).click();
  if (opts.separate) await page.locator('#ex-merge').click();
  await page.locator('#ex-name').fill(opts.name);
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 20000 }).catch(() => null),
    page.getByRole('dialog').getByRole('button', { name: /^Export / }).click(),
  ]);
  if (!dl) return null;
  const path = join(DL, dl.suggestedFilename());
  await dl.saveAs(path);
  await settle(page);
  return path;
}

await reset(page);
await pick(page, ['box.stl']);
await pick(page, ['cylinder.stl']);
await page.evaluate(() => {
  const s = window.__meshStudio.scene.getState();
  const o = s.objects[1];
  const fc = o.faceColors.slice(); fc.fill(5, 0, 48);
  s.updateObject('paint', o.id, { faceColors: fc });
});
await page.keyboard.press('Escape');
const ref = { box: await objectSize(page, 0), cyl: await objectSize(page, 1) };
const tris = (await sceneState(page)).objects.map((o) => o.tris);

const roundTrip = async (label, opts, check) => {
  const p = await exportVia(opts);
  ok(!!p, `${label}: downloaded ${p ? p.split(/[\\/]/).pop() : 'nothing'}`);
  if (!p) return;
  const prev = await sceneState(page);
  const before = prev.objects.length;
  await pick(page, [p]);
  const after = await sceneState(page);
  await check(after.objects.slice(before), p);
  await page.evaluate(({ n, sel }) => {
    const s = window.__meshStudio.scene.getState();
    s.apply('cleanup', { objects: s.objects.slice(0, n), selectedIds: sel });
  }, { n: before, sel: prev.selectedIds });
};

await roundTrip('STL binary, all, merged', { format: 'stl', scope: 'All', name: 'rt_bin' }, async (objs) => {
  ok(objs.length === 1 && objs[0].tris === tris[0] + tris[1], 'STL bin re-import: triangle count');
});
await tab('Scene');
await page.locator('[data-object-id]').first().click();
await roundTrip('STL binary, selected', { format: 'stl', scope: 'Selected', name: 'rt_sel' }, async (objs) => {
  ok(JSON.stringify(await objectSize(page, -1)) === JSON.stringify(ref.box) && objs[0].tris === tris[0], 'STL bin selected: dims + tris');
});
await roundTrip('STL ASCII', { format: 'stl-ascii', scope: 'Selected', name: 'rt_ascii' }, async (objs) => {
  ok(readFileSync(join(DL, 'rt_ascii.stl'), 'utf8').startsWith('solid'), 'ASCII STL text');
  ok(JSON.stringify(await objectSize(page, -1)) === JSON.stringify(ref.box) && objs[0].tris === tris[0], 'STL ASCII: dims + tris');
});
await roundTrip('STL in cm', { format: 'stl', scope: 'Selected', units: 'cm', name: 'rt_cm' }, async () => {
  ok(JSON.stringify(await objectSize(page, -1)) === JSON.stringify(ref.box.map((v) => v / 10)), 'cm export scales by 1/10');
});
await roundTrip('STL Y-up', { format: 'stl', scope: 'Selected', up: 'Y-up', name: 'rt_yup' }, async () => {
  const s = await objectSize(page, -1);
  ok(JSON.stringify(s) === JSON.stringify([ref.box[0], ref.box[2], ref.box[1]]), 'Y-up export swaps Y/Z for a Z-up importer: ' + JSON.stringify(s));
});
await page.keyboard.press('Escape');
await roundTrip('OBJ + MTL, all (zip)', { format: 'obj', scope: 'All', name: 'rt_obj' }, async (objs, p) => {
  ok(p.endsWith('.zip'), 'OBJ + MTL delivered as zip');
  ok(objs.length === 1 && objs[0].tris === tris[0] + tris[1], 'OBJ re-import: triangles');
  const pal = await page.evaluate(() => { const s = window.__meshStudio.scene.getState(); const o = s.objects.at(-1); return [...new Set([...o.faceColors].map((c) => s.palette[c]))].sort(); });
  ok(pal.includes('#7fb4ff'), 'OBJ keeps painted colour via MTL: ' + JSON.stringify(pal));
});
await roundTrip('GLB, all', { format: 'glb', scope: 'All', name: 'rt_glb' }, async (objs) => {
  ok(objs.length === 1 && objs[0].tris === tris[0] + tris[1], 'GLB re-import: triangles');
  const pal = await page.evaluate(() => { const s = window.__meshStudio.scene.getState(); const o = s.objects.at(-1); return [...new Set([...o.faceColors].map((c) => s.palette[c]))]; });
  ok(pal.includes('#7fb4ff'), 'GLB keeps colours');
  const sz = await objectSize(page, -1);
  ok(Math.abs(sz[2] - 40) < 0.01, 'GLB Y-up round trip keeps height');
});
await roundTrip('separate files', { format: 'stl', scope: 'All', separate: true, name: 'rt_sep' }, async (objs, p) => {
  ok(p.endsWith('.zip') && objs.length === 2, 'separate files → zip with 2 models, re-import gives 2 objects');
  ok(JSON.stringify(objs.map((o) => o.tris)) === JSON.stringify(tris), 'separate: triangle counts per object');
});

// pre-export warning
await reset(page);
await pick(page, ['open_box.stl']);
await page.keyboard.press('Escape');
await page.keyboard.press('Control+e');
await page.getByRole('dialog').getByRole('button', { name: /^Export / }).click();
await page.waitForSelector('[data-testid=export-warning]');
ok(/open/.test(await page.textContent('[data-testid=export-warning]')), 'non-manifold warning before export');
await shot(page, 'p2-export-warning');
await page.getByRole('button', { name: 'Repair all' }).click();
await page.waitForFunction(() => !document.querySelector('[data-testid=export-warning]'));
const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('dialog').getByRole('button', { name: /^Export / }).click()]);
ok(!!dl, 'after Repair all, export proceeds without warning');

await finish(browser, problems);
