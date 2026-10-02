// Image import dialog: live overlay, Levels, Invert, Smooth, Cancel, Import, re-tune, textures, large images.
import { launch, ok, pick, sceneState, objectSize, reset, shot, finish, settle } from './harness.mjs';
import { makePhase6Fixtures, makeImageFixtures } from './fixtures.mjs';

await makePhase6Fixtures();
makeImageFixtures();
const BASE_URL = process.argv[2] || 'http://localhost:5173/';
const { browser, page, problems } = await launch(BASE_URL);
const analyze = (idx = -1) => page.evaluate(async (idx) => window.__meshStudio.analyze(window.__meshStudio.scene.getState().objects.at(idx)), idx);
const dlg = () => page.getByRole('dialog');
const stats = async () => {
  const el = page.locator('[data-testid=image-overlay]');
  return { selected: Number(await el.getAttribute('data-selected')), points: Number(await el.getAttribute('data-points')) };
};
/** Waits until the overlay reports a result different from `prev` (debounced worker update). */
const changed = async (prev) => {
  await page.waitForFunction((p) => {
    const el = document.querySelector('[data-testid=image-overlay]');
    if (!el || el.dataset.selected === '') return false;
    return !p || el.dataset.selected !== String(p.selected) || el.dataset.points !== String(p.points);
  }, prev, { timeout: 20000 }).catch(async (e) => {
    console.log('alert:', await page.locator('[role=dialog] [role=alert]').textContent().catch(() => 'none'));
    console.log('changed() timeout; prev', JSON.stringify(prev), 'now', JSON.stringify(await stats()), await page.evaluate(() => JSON.stringify(window.__meshStudio.imageImport.getState().settings)));
    throw e;
  });
  await page.waitForTimeout(250);
  return stats();
};
const slider = async (label, v) => { await dlg().getByLabel(label, { exact: true }).fill(String(v)); };
const overlayPixels = () => page.evaluate(() => {
  const c = document.querySelector('[data-testid=image-overlay]');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let hi = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] > 160 && d[i + 2] < 140) hi++; // accent-yellow highlight
  return hi;
});

// ---------- open via the Create tab picker: dialog, nothing added yet ----------
await page.getByRole('tab', { name: 'Create' }).click();
await pick(page, ['gradient.png']); // Open button works too: images open the dialog
ok(await dlg().isVisible(), 'picking a PNG opens the Image import dialog');
ok((await sceneState(page)).objects.length === 0, 'nothing is added before Import');
let a = await changed(null);
const total = 64 * 32;
ok(a.selected > 0 && a.selected < total, `overlay shows a partial selection (${a.selected}/${total})`);
const hi1 = await overlayPixels();

// ---------- Levels slider changes the selection overlay ----------
await slider('Levels', 200);
const b = await changed(a);
ok(b.selected < a.selected, `raising Levels selects fewer pixels (${a.selected} → ${b.selected})`);
const hi2 = await overlayPixels();
ok(hi2 < hi1, `highlight on the overlay shrinks too (${hi1} → ${hi2} highlighted px)`);
await slider('Levels', 60);
const c = await changed(b);
ok(c.selected > a.selected, `lowering Levels selects more (${c.selected})`);
await slider('Levels', 100);
a = await changed(c);

// ---------- Cancel adds nothing ----------
await dlg().getByRole('button', { name: 'Cancel' }).click();
await page.waitForTimeout(300);
ok(!(await dlg().isVisible().catch(() => false)) && (await sceneState(page)).objects.length === 0, 'Cancel closes the dialog and adds nothing');

// ---------- Invert flips the selection (ring image) ----------
await pick(page, ['ring.png']);
const ringA = await changed(null);
const ringTotal = 120 * 80;
await dlg().locator('#ii-invert').click();
const inv = await changed(ringA);
ok(Math.abs(inv.selected + ringA.selected - ringTotal) <= 40, `Invert flips the selection (${ringA.selected} + ${inv.selected} ≈ ${ringTotal})`);
await shot(page, 'p9-invert');
await dlg().locator('#ii-invert').click();
await changed(inv);

// ---------- Smooth changes the contour point count ----------
await slider('Smooth', 0);
let s0 = await changed(null);
await slider('Smooth', 8);
const s8 = await changed(s0);
ok(s8.points !== s0.points && s8.points > 0, `Smooth changes the outline point count (${s0.points} → ${s8.points})`);
await slider('Smooth', 1);
s0 = await changed(s8);
await shot(page, 'p9-dialog');

// ---------- Import adds one object of the expected size ----------
await dlg().locator('#ii-width').fill('60'); await dlg().locator('#ii-width').press('Enter');
await dlg().locator('#ii-depth').fill('4'); await dlg().locator('#ii-depth').press('Enter');
await page.waitForTimeout(400);
await dlg().getByRole('button', { name: 'Import', exact: true }).click();
await page.waitForFunction(() => !window.__meshStudio.imageImport.getState().open, null, { timeout: 60000 });
await settle(page);
let st = await sceneState(page);
let sz = await objectSize(page);
a = await analyze();
ok(st.objects.length === 1, 'Import adds exactly one object');
ok(Math.abs(sz[0] - 35) < 1.5 && Math.abs(sz[1] - 35) < 1.5 && Math.abs(sz[2] - 4) < 1e-3, 'ring is ≈35 × 35 mm (70 of 120 px at 60 mm) and 4 mm deep: ' + JSON.stringify(sz));
ok(a.manifold && a.genus === 1, 'imported ring is watertight with its hole');
ok((await page.evaluate(() => window.__meshStudio.geo.worldBox(window.__meshStudio.scene.getState().objects[0]).min.z)) === 0, 'placed on the grid');

// ---------- re-tune from the Create tab ----------
await page.getByRole('button', { name: /Re-tune “ring”/ }).click();
await page.waitForSelector('[data-testid=image-overlay][data-selected]:not([data-selected=""])');
ok((await dlg().locator('#ii-depth').inputValue()) === '4', 're-tune dialog reopens with the saved settings');
await dlg().locator('#ii-depth').fill('6'); await dlg().locator('#ii-depth').press('Enter');
await page.waitForTimeout(400);
await dlg().getByRole('button', { name: 'Apply' }).click();
await page.waitForFunction(() => !window.__meshStudio.imageImport.getState().open, null, { timeout: 60000 });
await settle(page);
st = await sceneState(page);
ok(st.objects.length === 1 && Math.abs((await objectSize(page))[2] - 6) < 1e-3, 'Apply replaces the object in place (now 6 mm deep)');
await page.keyboard.press('Control+z');
ok(Math.abs((await objectSize(page))[2] - 4) < 1e-3, 'undo restores the previous tuning');

// ---------- Textures keep image colours on the top ----------
await reset(page);
await pick(page, ['two_colours.png']);
await changed(null);
await dlg().locator('#ii-tex').click();
await page.waitForTimeout(400);
await dlg().getByRole('button', { name: 'Import', exact: true }).click();
await page.waitForFunction(() => !window.__meshStudio.imageImport.getState().open, null, { timeout: 60000 });
await settle(page);
const cols = await page.evaluate(() => {
  const s = window.__meshStudio.scene.getState(); const o = s.objects[0];
  return [...new Set(o.faceColors)].map((c) => s.palette[c]);
});
const reddish = cols.some((h) => parseInt(h.slice(1, 3), 16) > 150 && parseInt(h.slice(5, 7), 16) < 90);
const bluish = cols.some((h) => parseInt(h.slice(5, 7), 16) > 150 && parseInt(h.slice(1, 3), 16) < 90);
ok(reddish && bluish && cols.includes('#dc1e1e') && cols.includes('#1e3cdc'), 'Textures: red disc and blue square keep their exact colours: ' + JSON.stringify(cols));
ok(!cols.includes('#ffffff'), 'no white background speckles on the top faces');
ok((await sceneState(page)).objects[0] && (await analyze()).components === 2, 'two separate shapes extruded');
await shot(page, 'p9-textures');

// ---------- large image: downscaled preview, full-resolution import ----------
await reset(page);
await pick(page, ['large.png']);
await changed(null);
const dims = await page.evaluate(() => { const c = document.querySelector('[data-testid=image-overlay]'); return [c.width, c.height]; });
ok(dims[0] === 400 && dims[1] === 267, 'preview of a 3000 × 2000 image is downscaled to 400 px: ' + JSON.stringify(dims));
const previewPoints = (await stats()).points;
await dlg().getByRole('button', { name: 'Import', exact: true }).click();
await page.waitForFunction(() => !window.__meshStudio.imageImport.getState().open, null, { timeout: 120000 });
await settle(page, 120000);
const tris = (await sceneState(page)).objects[0].tris;
sz = await objectSize(page);
ok(Math.abs(sz[0] - 48) < 0.6 && Math.abs(sz[1] - 32) < 0.6, 'large image ellipse at 60 mm width: ≈48 × 32 mm: ' + JSON.stringify(sz));
ok(tris > previewPoints * 2, `import uses the full-resolution outline (${tris} triangles vs ${previewPoints} preview points)`);

await finish(browser, problems);
