// Gap features, batch 3: painted 3MF for Bambu Studio / PrusaSlicer (export + import).
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { launch, ok, pick, sceneState, reset, shot, finish, settle, FIX } from './harness.mjs';
import { makeFixtures, makePaintedFixtures } from './fixtures.mjs';

makeFixtures();
await makePaintedFixtures();
const JSZip = createRequire(new URL('../../package.json', import.meta.url))('jszip');
const BASE_URL = process.argv[2] || 'http://localhost:5173/';
const { browser, page, problems } = await launch(BASE_URL);
const DL = join(tmpdir(), 'mesh-studio-downloads');
mkdirSync(DL, { recursive: true });
const colorsByTri = (idx = 0) => page.evaluate((idx) => { const s = window.__meshStudio.scene.getState(); const o = s.objects.at(idx); return [...o.faceColors].map((c) => s.palette[c].toLowerCase()); }, idx);

async function exportAs(format, name) {
  await page.keyboard.press('Control+e');
  await page.waitForSelector('#ex-format');
  await page.selectOption('#ex-format', format);
  await page.getByRole('dialog').getByRole('radio', { name: 'All' }).click();
  await page.locator('#ex-name').fill(name);
  const slots = await page.locator('[data-testid=filament-slots]').count() ? await page.locator('[data-testid=filament-slots]').innerText() : '';
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('dialog').getByRole('button', { name: /^Export / }).click()]);
  const path = join(DL, dl.suggestedFilename());
  await dl.saveAs(path);
  await settle(page);
  return { path, slots };
}

// ---------- export: a box painted in two colours + a single-colour box ----------
await pick(page, ['box.stl']);
await pick(page, ['box.stl']);
await page.evaluate(() => {
  const s = window.__meshStudio.scene.getState();
  const [a, b] = s.objects;
  const fa = a.faceColors.slice(); fa.fill(3, 0, 4); // #ef6b73 on 4 triangles
  const fb = b.faceColors.slice(); fb.fill(5); // #7fb4ff
  s.apply('paint', { objects: [{ ...a, faceColors: fa }, { ...b, faceColors: fb }] });
  s.apply('palette', { palette: [...s.palette] });
});
await page.keyboard.press('Escape');
const before0 = await colorsByTri(0), before1 = await colorsByTri(1);
const { path, slots } = await exportAs('3mf', 'painted');
ok(/1\s*#b58fd0/i.test(slots) && /2\s*#ef6b73/i.test(slots) && /3\s*#7fb4ff/i.test(slots), 'export dialog lists the filament slots: ' + slots.replace(/\s+/g, ' '));
const zip = await JSZip.loadAsync(readFileSync(path));
const model = await zip.file('3D/3dmodel.model').async('string');
const tris = [...model.matchAll(/<triangle [^>]*>/g)].map((m) => m[0]);
const pc = tris.map((t) => /paint_color="([^"]*)"/.exec(t)?.[1]);
const mmu = tris.map((t) => /slic3rpe:mmu_segmentation="([^"]*)"/.exec(t)?.[1]);
ok(tris.length === 24 && pc.every((c) => c) && pc.every((c, i) => c === mmu[i]), 'every triangle carries paint_color (Bambu) and slic3rpe:mmu_segmentation (Prusa)');
ok(pc.slice(0, 4).every((c) => c === '8') && pc.slice(4, 12).every((c) => c === '4') && pc.slice(12).every((c) => c === '0C'), 'filament codes: slot 1 → "4", slot 2 → "8", slot 3 → "0C"');
ok(!/basematerials/.test(model) && /xmlns:slic3rpe=/.test(model) && /MmPaintingVersion">1/.test(model), 'no basematerials; Prusa namespace and painting version declared');
ok(/MeshStudio:FilamentColours">#B58FD0;#EF6B73;#7FB4FF</.test(model), 'slot colours stored as metadata');
// round trip back into Mesh Studio
await reset(page);
await pick(page, [path]);
ok(JSON.stringify(await colorsByTri(0)) === JSON.stringify(before0) && JSON.stringify(await colorsByTri(1)) === JSON.stringify(before1), 'painted 3MF re-imports with the same per-triangle colours');
// standard 3MF still available
const std = await exportAs('3mf-std', 'standard');
const stdModel = await (await JSZip.loadAsync(readFileSync(std.path))).file('3D/3dmodel.model').async('string');
ok(/basematerials/.test(stdModel) && !/paint_color/.test(stdModel) && std.slots === '', 'standard 3MF uses basematerials, no painting, no slot list');

// ---------- import: Bambu Studio file ----------
await reset(page);
await pick(page, [join(FIX, 'bambu_painted.3mf')]);
let st = await sceneState(page);
let c = await colorsByTri(0);
ok(st.objects.length === 1 && st.objects[0].tris === 12, 'Bambu 3MF: one object through the production-extension component');
ok(c[0] === '#ff0000' && c[1] === '#ff0000', 'paint_color "4" → filament 1 colour from project_settings (#FF0000)');
ok(c[2] === '#0000ff' && c[3] === '#0000ff', 'paint_color "0C" → filament 3 (#0000FF)');
ok(c[4] === '#ff0000', 'subdivided triangle takes its dominant filament (3/4 filament 1)');
ok(c.slice(5).every((x) => x === '#00ff00'), 'unpainted triangles use the object extruder (2 → #00FF00) from model_settings.config');
await shot(page, 'p12-bambu-import');

// ---------- import: PrusaSlicer file ----------
await reset(page);
await pick(page, [join(FIX, 'prusa_painted.3mf')]);
c = await colorsByTri(0);
ok(c.slice(0, 6).every((x) => x === '#00ffff') && c.slice(6).every((x) => x === '#ffff00'), 'Prusa 3MF: mmu_segmentation "8" → extruder 2 (#00FFFF), rest extruder 1 (#FFFF00) from Slic3r_PE.config');

await finish(browser, problems);
