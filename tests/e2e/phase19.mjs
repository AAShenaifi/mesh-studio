// Phase 19: Add-text live preview, move/scale, many fonts, custom font upload.
import { launch, ok, pick, objectBox, errorText, reset, shot, finish, settle } from './harness.mjs';
import { readFileSync } from 'node:fs';

const BASE_URL = process.argv[2] || 'http://localhost:5173/';
const { browser, page, problems } = await launch(BASE_URL);
const analyze = (idx = -1) => page.evaluate(async (idx) => window.__meshStudio.analyze(window.__meshStudio.scene.getState().objects.at(idx)), idx);
const panel = (t) => page.locator(`[data-panel="${t}"]`);
const ghost = () => page.evaluate(() => ({ ...window.__meshStudio.ghost }));
const waitGhost = (timeout = 60000) => page.waitForFunction(() => window.__meshStudio.ghost.verts > 0, null, { timeout });

await pick(page, ['box.stl']);
await page.getByRole('tab', { name: 'Edit' }).click();
const box = await objectBox(page, 0);
await waitGhost(120000);
let g = await ghost();
ok(g.verts > 0, 'live preview appears as soon as the Add text panel is open');
const topZ = box.max[2];
ok(Math.abs(g.position[2] - (topZ - 0.8)) < 0.05, 'engrave preview sits inside the top face (z ' + g.position[2].toFixed(2) + ' vs top ' + topZ + ')');

// scale: slider changes preview instantly (no re-render)
const k0 = g.scale[0];
await panel('Add text').getByTestId('text-scale').fill('20');
await page.waitForTimeout(300);
g = await ghost();
ok(Math.abs(g.scale[0] / k0 - 20 / 6) < 0.05, 'scale slider resizes the preview (x' + (g.scale[0] / k0).toFixed(2) + ')');
await panel('Add text').getByTestId('text-scale').fill('6');

// move: numeric offset moves the preview
await page.locator('#tx-dx').fill('5'); await page.locator('#tx-dx').press('Enter');
await page.locator('#tx-dy').fill('-3'); await page.locator('#tx-dy').press('Enter');
await page.waitForTimeout(300);
const g2 = await ghost();
ok(Math.abs(g2.position[0] - g.position[0] - 5) < 0.05 && Math.abs(g2.position[1] - g.position[1] + 3) < 0.05, 'X/Y offset moves the preview');

// move with the cursor over the model
await panel('Add text').getByTestId('text-move').click();
const cv = await page.locator('canvas').first().boundingBox();
await page.mouse.move(cv.x + cv.width * 0.5, cv.y + cv.height * 0.5);
await page.mouse.move(cv.x + cv.width * 0.52, cv.y + cv.height * 0.5, { steps: 4 });
await page.waitForTimeout(400);
await page.mouse.click(cv.x + cv.width * 0.52, cv.y + cv.height * 0.5);
await page.waitForTimeout(300);
const moved = await page.evaluate(() => ({ dx: window.__meshStudio.text.getState().dx, dy: window.__meshStudio.text.getState().dy, tool: window.__meshStudio.app.getState().activeTool }));
ok(moved.tool === null, 'clicking fixes the spot and ends positioning');
console.log('cursor offset', moved.dx, moved.dy);
await shot(page, 'p19-preview');

// emboss turns the preview green and raises it
await panel('Add text').getByRole('radio', { name: 'Emboss' }).click();
await page.waitForTimeout(200);
g = await ghost();
ok(Math.abs(g.position[2] - topZ) < 0.1, 'emboss preview sits on top of the face');
await panel('Add text').getByRole('radio', { name: 'Engrave' }).click();
await page.locator('#tx-dx').fill('0'); await page.locator('#tx-dx').press('Enter');
await page.locator('#tx-dy').fill('0'); await page.locator('#tx-dy').press('Enter');

// fonts: groups, many options, a downloaded font engraves
const opts = await page.locator('#tx-font option').count();
const groups = await page.locator('#tx-font optgroup').count();
ok(opts >= 50 && groups >= 5, `font list has ${opts} fonts in ${groups} groups`);
await page.locator('#tx-font').selectOption('cairo-bold');
await panel('Add text').getByRole('textbox', { name: 'Text', exact: true }).fill('مرحبا');
await waitGhost();
await page.waitForTimeout(1500);
ok((await ghost()).verts > 0, 'Arabic font (Cairo) previews');
const before = await analyze(0);
await panel('Add text').getByRole('button', { name: /Engrave text/ }).click();
await settle(page, 180000);
const a = await analyze(0);
ok(!(await errorText(page)) && a.manifold && a.volume < before.volume - 0.5, 'engrave with a downloaded font cuts the top: ' + (before.volume - a.volume).toFixed(1));
await shot(page, 'p19-engraved');

// every font must really be used (different outline than the fallback) -> check a few via the preview geometry size
const sizes = {};
for (const id of ['sans', 'anton', 'orbitron-extrabold', 'lobster-regular', 'amiri-bold']) {
  await panel('Add text').getByRole('textbox', { name: 'Text', exact: true }).fill('Hello');
  await page.locator('#tx-font').selectOption(id);
  await page.waitForTimeout(2500);
  sizes[id] = (await ghost()).verts;
}
console.log(JSON.stringify(sizes));
ok(new Set(Object.values(sizes)).size >= 4, 'different fonts give different lettering');

// custom font upload
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), panel('Add text').getByRole('button', { name: /Use my own font file/ }).click()]);
await chooser.setFiles(new URL('../../public/fonts/satisfy-regular.ttf', import.meta.url).pathname);
await page.waitForTimeout(500);
ok((await page.locator('#tx-font').inputValue()).startsWith('custom-'), 'uploaded font is selected');
ok((await page.locator('#tx-font optgroup[label="Your fonts"] option').count()) === 1, 'uploaded font listed under “Your fonts”');
await page.waitForTimeout(2500);
ok((await ghost()).verts > 0, 'uploaded font previews');

// surface placement: pick a spot on a wall, preview shows, apply engraves
await panel('Add text').getByRole('radio', { name: 'On surface' }).click();
await panel('Add text').getByRole('textbox', { name: 'Text', exact: true }).fill('AB');
await page.locator('#tx-font').selectOption('sans');
ok((await panel('Add text').getByTestId('text-apply').isDisabled()), 'surface Apply is disabled until a spot is picked');
await panel('Add text').getByTestId('text-move').click();
await page.mouse.move(cv.x + cv.width * 0.5, cv.y + cv.height * 0.55, { steps: 5 });
await page.waitForTimeout(500);
await page.mouse.click(cv.x + cv.width * 0.5, cv.y + cv.height * 0.55);
await page.waitForTimeout(2500);
ok((await ghost()).verts > 0, 'surface preview shows at the picked spot');
await shot(page, 'p19-surface');
const b2 = await analyze(0);
await panel('Add text').getByTestId('text-apply').click();
await settle(page, 180000);
const a2 = await analyze(0);
ok(!(await errorText(page)) && a2.volume < b2.volume - 0.05, 'surface text applied at the previewed spot: ' + (b2.volume - a2.volume).toFixed(2));

// ---------- picture (logo) and SVG on the top face ----------
await reset(page);
await pick(page, ['box.stl']);
await page.getByRole('tab', { name: 'Edit' }).click();
await panel('Add text').getByRole('radio', { name: 'Top face' }).click();
await panel('Add text').getByRole('radio', { name: 'Picture' }).click();
ok(await panel('Add text').getByTestId('text-apply').isDisabled(), 'picture Apply disabled until a picture is chosen');
const [ch1] = await Promise.all([page.waitForEvent('filechooser'), panel('Add text').getByRole('button', { name: /Choose a logo picture/ }).click()]);
await ch1.setFiles(new URL('./logo-fixture.png', import.meta.url).pathname);
await page.waitForFunction(() => window.__meshStudio.ghost.verts > 0, null, { timeout: 60000 });
ok(true, 'picture traced and previewed');
await panel('Add text').getByTestId('img-threshold').fill('100');
await page.waitForTimeout(2500);
ok((await ghost()).verts > 0, 'threshold slider keeps a preview');
await shot(page, 'p19-picture');
await page.locator('#tx-svgw').fill('20'); await page.locator('#tx-svgw').press('Enter');
const pb = await analyze(0);
await panel('Add text').getByTestId('text-apply').click();
await settle(page, 180000);
const pa = await analyze(0);
ok(!(await errorText(page)) && pa.volume < pb.volume - 1, 'picture engraved into the top face: ' + (pb.volume - pa.volume).toFixed(1));

await reset(page);
await pick(page, ['box.stl']);
await page.getByRole('tab', { name: 'Edit' }).click();
await panel('Add text').getByRole('radio', { name: 'SVG' }).click();
const [ch2] = await Promise.all([page.waitForEvent('filechooser'), panel('Add text').getByRole('button', { name: /Choose an SVG/ }).click()]);
await ch2.setFiles(new URL('./logo-fixture.svg', import.meta.url).pathname);
await page.waitForFunction(() => window.__meshStudio.ghost.verts > 0, null, { timeout: 60000 });
await panel('Add text').getByRole('radio', { name: 'Emboss' }).click();
const sb = await analyze(0);
await panel('Add text').getByTestId('text-apply').click();
await settle(page, 180000);
const sa = await analyze(0);
ok(!(await errorText(page)) && sa.volume > sb.volume + 0.5, 'SVG embossed on the top face: +' + (sa.volume - sb.volume).toFixed(1));

await finish(browser, problems);
