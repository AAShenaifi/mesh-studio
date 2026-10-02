// Phase 6: 3MF import/export with colours, SVG and PNG extrusion.
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync } from 'node:fs';
import { launch, ok, pick, drop, sceneState, objectSize, errorText, reset, shot, finish, settle } from './harness.mjs';
import { makePhase6Fixtures } from './fixtures.mjs';

await makePhase6Fixtures();
const BASE_URL = process.argv[2] || 'http://localhost:5173/';
const { browser, page, problems } = await launch(BASE_URL);
const DL = join(tmpdir(), 'mesh-studio-downloads');
mkdirSync(DL, { recursive: true });
const analyze = (idx = -1) => page.evaluate(async (idx) => window.__meshStudio.analyze(window.__meshStudio.scene.getState().objects.at(idx)), idx);
const near = (a, b, eps = 0.05) => a.every((v, i) => Math.abs(v - b[i]) <= eps);
const colorsOf = (idx) => page.evaluate((idx) => { const s = window.__meshStudio.scene.getState(); const o = s.objects.at(idx); return [...new Set(o.faceColors)].map((c) => s.palette[c]).sort(); }, idx);

// ---------- 3MF export → import round trip ----------
await pick(page, ['box.stl']);
await pick(page, ['cylinder.stl']);
await page.evaluate(() => {
  const s = window.__meshStudio.scene.getState();
  const [a, b] = s.objects;
  const fa = a.faceColors.slice(); fa.fill(3, 0, 2);
  const fb = b.faceColors.slice(); fb.fill(5);
  s.apply('paint', { objects: [{ ...a, faceColors: fa }, { ...b, faceColors: fb }] });
  s.apply('palette', { palette: [...s.palette] });
});
await page.keyboard.press('Escape');
const ref = { a: await objectSize(page, 0), b: await objectSize(page, 1) };
const tris = (await sceneState(page)).objects.map((o) => o.tris);
await page.keyboard.press('Control+e');
const options = await page.$$eval('#ex-format option', (os) => os.map((o) => o.textContent));
ok(options[0] === '3MF for Bambu Studio / PrusaSlicer (painted)' && options[1] === '3MF (standard colours)', '3MF formats come first: ' + options.join(', '));
await page.selectOption('#ex-format', '3mf');
await page.getByRole('dialog').getByRole('radio', { name: 'All' }).click();
await page.getByRole('dialog').getByRole('radio', { name: 'cm', exact: true }).click();
await page.locator('#ex-name').fill('rt3mf');
const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('dialog').getByRole('button', { name: /^Export / }).click()]);
const path = join(DL, dl.suggestedFilename());
await dl.saveAs(path);
ok(path.endsWith('rt3mf.3mf'), '3MF downloaded');
await settle(page);
await reset(page);
await pick(page, [path]);
let st = await sceneState(page);
ok(st.objects.length === 2, '3MF re-import keeps 2 objects');
ok(st.objects[0].tris === tris[0] && st.objects[1].tris === tris[1], '3MF triangle counts');
ok(near(await objectSize(page, 0), ref.a, 0.01) && near(await objectSize(page, 1), ref.b, 0.01), '3MF in cm re-imports at the original size (unit attribute)');
const c0 = await colorsOf(0), c1 = await colorsOf(1);
ok(c0.includes('#ef6b73') && c0.includes('#b58fd0') && c1.length === 1 && c1[0] === '#7fb4ff', `3MF colours survive: ${JSON.stringify(c0)} ${JSON.stringify(c1)}`);
const a0 = await analyze(0);
ok(a0.manifold, '3MF object watertight after round trip');

// ---------- third-party 3MF ----------
await reset(page);
await pick(page, ['thirdparty.3mf']);
st = await sceneState(page);
ok(st.objects.length === 1 && st.objects[0].name === 'pair' && st.objects[0].tris === 24, 'components flattened into one build item (2 × 12 triangles)');
const tp = await objectSize(page);
ok(near(tp, [20, 60, 30], 0.01), 'cm units, component offset and 90° build transform applied: ' + JSON.stringify(tp));
ok((await colorsOf(-1)).includes('#00ff00'), 'colorgroup colours imported');

// ---------- SVG extrusion ----------
await reset(page);
await page.getByRole('tab', { name: 'Create' }).click();
await page.locator('#ex2-w').fill('85'); await page.locator('#ex2-w').press('Enter'); // 170 px wide drawing → 0.5 mm/px
await drop(page, ['shapes.svg']);
let sz = await objectSize(page);
let an = await analyze();
ok(near(sz, [85, 25, 3], 0.05), 'SVG extruded to 85 mm wide, 3 mm deep: ' + JSON.stringify(sz));
const area = (100 * 50 - 50 * 30) * 0.25 + Math.PI * 400 * 0.25;
ok(an.manifold && an.components === 2 && Math.abs(an.volume - area * 3) / (area * 3) < 0.02, `evenodd hole + circle: genus 1, 2 pieces, volume ≈ ${(area * 3).toFixed(0)}: ${an.volume.toFixed(0)}`);
await drop(page, ['line.svg']);
an = await analyze();
sz = await objectSize(page);
ok(an.manifold && an.components === 1 && Math.abs(sz[0] - 85) < 0.05 && sz[1] > 5 && sz[1] < 7 && Math.abs(sz[2] - 3) < 0.01, 'stroke-only path extrudes as a solid line: ' + JSON.stringify(sz) + ' ' + an.manifold + ' ' + an.components);
await shot(page, 'p6-svg');

// ---------- PNG silhouette + relief (through the Image import dialog) ----------
await reset(page);
const importDialog = async (file, opts = {}) => {
  await drop(page, [file]);
  await page.waitForSelector('[data-testid=image-overlay][data-selected]:not([data-selected=""])');
  if (opts.relief) await page.getByRole('dialog').getByRole('radio', { name: 'Relief' }).click();
  for (const [sel, v] of Object.entries(opts.fields ?? {})) { await page.locator(sel).fill(String(v)); await page.locator(sel).press('Enter'); }
  await page.waitForTimeout(400);
  await page.getByRole('dialog').getByRole('button', { name: 'Import', exact: true }).click();
  await page.waitForFunction(() => !window.__meshStudio.imageImport.getState().open, null, { timeout: 60000 });
  await settle(page);
};
await importDialog('ring.png', { fields: { '#ii-width': 60 } });
an = await analyze();
sz = await objectSize(page);
ok(an.manifold && an.genus === 1 && an.components === 1, 'PNG ring silhouette → one watertight ring (genus 1)');
ok(Math.abs(sz[0] - 35) < 2 && Math.abs(sz[2] - 3) < 0.01, 'ring scaled: 70 px of 120 at 60 mm → ≈35 mm: ' + JSON.stringify(sz));
await importDialog('gradient.png', { relief: true, fields: { '#ii-depth': 2 } });
an = await analyze();
sz = await objectSize(page);
ok(an.manifold && near(sz, [60, 60 * 31 / 63, 2.6], 0.05), 'relief: watertight plate 60 mm wide, base 0.6 + 2 mm: ' + JSON.stringify(sz));
await shot(page, 'p6-png');

// glTF + PNG together: PNG is a texture sidecar, not extruded
await reset(page);
await drop(page, ['box.gltf', 'box.bin', 'ring.png']);
ok((await sceneState(page)).objects.length === 1 && !(await errorText(page)), 'PNG next to a .gltf is treated as a texture');

await finish(browser, problems);
