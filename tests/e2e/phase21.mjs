// Phase 21: shapes on curved surfaces wrap like a sticker (cylinder, rounded corner), preview = result.
import { launch, ok, finish, settle, shot, errorText } from './harness.mjs';

const BASE_URL = process.argv[2] || 'http://localhost:5173/';
const { browser, page, problems } = await launch(BASE_URL);
const panel = (t) => page.locator(`[data-panel="${t}"]`);
const ghost = () => page.evaluate(() => ({ ...window.__meshStudio.ghost }));
const analyze = () => page.evaluate(async () => window.__meshStudio.analyze(window.__meshStudio.scene.getState().objects[0]));

await page.evaluate(() => window.__meshStudio.tools.addPrimitive('cylinder', [30, 30, 40], 96, 0));
await settle(page);
await page.getByRole('tab', { name: 'Edit' }).click();
await panel('Add text').getByRole('radio', { name: 'On surface' }).click();
ok((await panel('Add text').getByRole('radio', { name: 'Wrap' }).getAttribute('aria-checked')) === 'true', 'Wrap is the default for surface placement');
await panel('Add text').getByRole('radio', { name: 'SVG' }).click();
const [ch] = await Promise.all([page.waitForEvent('filechooser'), panel('Add text').getByRole('button', { name: /Choose an SVG/ }).click()]);
await ch.setFiles(new URL('./logo-fixture.svg', import.meta.url).pathname);
await page.locator('#tx-svgw').fill('30'); await page.locator('#tx-svgw').press('Enter');

// pick the spot on the +X side of the cylinder, half way up
const spot = () => page.evaluate(() => {
  const s = window.__meshStudio.scene.getState();
  const o = s.objects[0];
  const b = window.__meshStudio.geo.worldBox(o);
  const c = [(b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2];
  window.__meshStudio.text.getState().set({ anchor: { objectId: o.id, point: [b.max.x, c[1], c[2]], normal: [1, 0, 0] } });
  return c;
});
const c = await spot();
await page.waitForFunction(() => window.__meshStudio.ghost.conforming, null, { timeout: 30000 });
let g = await ghost();
// 30 mm of arc on r = 15 is 2 rad: chord along Y = 2·15·sin(1) = 25.2, depth along X = 15·(1−cos 1) = 6.9
console.log('wrap span', g.span);
ok(Math.abs(g.span[1] - 25.24) < 1.2, 'wrapped preview bends around the cylinder (Y span ' + g.span[1].toFixed(2) + ' ≈ 25.2)');
ok(g.span[0] > 5.5, 'wrapped preview curves back along X (' + g.span[0].toFixed(2) + ')');
await page.evaluate(() => window.__meshStudio.app.getState().requestCamera('fit', 'all'));
await page.waitForTimeout(500);
await shot(page, 'p21-wrap-preview');

await panel('Add text').getByRole('radio', { name: 'Project' }).click();
await page.waitForTimeout(600);
g = await ghost();
ok(g.conforming && Math.abs(g.span[1] - 30) < 1, 'Project keeps the flat 30 mm width (' + g.span[1].toFixed(2) + ')');
await panel('Add text').getByRole('radio', { name: 'Wrap' }).click();
await page.waitForTimeout(600);

const before = await analyze();
await panel('Add text').getByTestId('text-apply').click();
await settle(page, 180000);
const after = await analyze();
ok(!(await errorText(page)) && after.manifold && after.volume < before.volume - 5, 'wrapped engrave cuts the cylinder: ' + (before.volume - after.volume).toFixed(1));
const res = await page.evaluate(() => window.__meshStudio.app.getState().status ?? '');
ok(!/hangs over/.test(JSON.stringify(res)), 'nothing hangs over the edge');
await page.waitForTimeout(800);
await shot(page, 'p21-wrapped');

// rounded box corner (r 6): the shape crosses the fillet onto both flat faces
await page.evaluate(() => { const s = window.__meshStudio.scene.getState(); s.apply('clear', { objects: [], selectedIds: [] }); });
await page.evaluate(async () => {
  const o = await window.__meshStudio.generators.code('Rounded box', 'hull() for (x = [-14, 14], y = [-14, 14]) translate([x, y, 0]) cylinder(r = 6, h = 30, $fn = 64);');
  window.__meshStudio.scene.getState().addObjects('add', [o]);
});
await settle(page, 120000);
const corner = await page.evaluate(() => {
  const s = window.__meshStudio.scene.getState();
  const o = s.objects[0];
  const b = window.__meshStudio.geo.worldBox(o);
  const cx = (b.min.x + b.max.x) / 2, cy = (b.min.y + b.max.y) / 2, cz = (b.min.z + b.max.z) / 2;
  const k = Math.SQRT1_2;
  window.__meshStudio.scene.getState().select([o.id], 'replace');
  window.__meshStudio.text.getState().set({ anchor: { objectId: o.id, point: [cx + 14 + 6 * k, cy + 14 + 6 * k, cz], normal: [k, k, 0] } });
  return { n: s.objects.length, size: [b.max.x - b.min.x, b.max.y - b.min.y] };
});
ok(corner.n === 1 && Math.abs(corner.size[0] - 40) < 0.1, 'rounded box built');
await page.waitForFunction(() => window.__meshStudio.ghost.conforming, null, { timeout: 30000 });
await page.waitForTimeout(500);
g = await ghost();
console.log('corner span', g.span);
// wrapped: 30 mm of path = 9.4 around the fillet + 10.3 on each face → about 18.6 × 18.6 in plan, not a flat 30 mm slab
ok(g.span[0] > 15 && g.span[0] < 21 && g.span[1] > 15 && g.span[1] < 21, 'preview folds round the corner onto both faces');
await page.evaluate(() => window.__meshStudio.app.getState().requestCamera('fit', 'all'));
await page.waitForTimeout(500);
await shot(page, 'p21-corner-preview');
const cb = await analyze();
await panel('Add text').getByTestId('text-apply').click();
await settle(page, 180000);
const ca = await analyze();
const cut = cb.volume - ca.volume;
ok(!(await errorText(page)) && ca.manifold && cut > 240 && cut < 320, 'corner engrave removes about area × depth (' + cut.toFixed(1) + ' mm³, flat ≈ 292)');
await page.waitForTimeout(500);
await shot(page, 'p21-corner');
await finish(browser, problems);
