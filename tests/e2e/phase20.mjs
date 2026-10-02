// Phase 20: type over a measured value and scale the object to match (uniform or one axis).
import { launch, ok, finish, settle, shot, objectSize } from './harness.mjs';

const BASE_URL = process.argv[2] || 'http://localhost:5173/';
const { browser, page, problems } = await launch(BASE_URL);
const panel = () => page.locator('[data-panel="Measure"]');
const close = (a, b, e = 0.02) => Math.abs(a - b) <= e;
await page.evaluate(() => window.__meshStudio.tools.addPrimitive('box', [30, 20, 10], 64, 0));
await settle(page);
await page.getByRole('tab', { name: 'Scene' }).click();
await page.evaluate(() => window.__meshStudio.app.getState().setPanelOpen('Measure', true));
await panel().getByRole('button', { name: /Start measuring/ }).click();

/** Two corner points of the box: a→b diagonal in X and Y (30 × 20). */
const pickCorners = (dz = false) => page.evaluate((dz) => {
  const o = window.__meshStudio.scene.getState().objects[0];
  const b = window.__meshStudio.geo.worldBox(o);
  const p = (x, y, z) => ({ objectId: o.id, type: 'point', p: [x, y, z], snap: 'corner' });
  window.__meshStudio.measure.store.getState().set({ picks: [p(b.min.x, b.min.y, b.max.z), dz ? p(b.min.x, b.min.y, b.min.z) : p(b.max.x, b.max.y, b.max.z)] });
}, dz);
const setTarget = async (v) => { await page.locator('#ms-target').fill(String(v)); await page.locator('#ms-target').press('Enter'); };
const distance = () => page.evaluate(() => { const [a, b] = window.__meshStudio.measure.store.getState().picks; return Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1], a.p[2] - b.p[2]); });

// 1) uniform: diagonal 36.06 → 72.11 doubles everything
await pickCorners();
ok(close(await distance(), Math.hypot(30, 20)), 'diagonal measured');
await page.locator('[data-testid=measure-scale]').waitFor();
await setTarget((Math.hypot(30, 20) * 2).toFixed(4));
ok(/× 2\.0000/.test(await page.locator('[data-testid=measure-scale-factor]').innerText()), 'uniform factor ×2 shown');
await page.getByTestId('measure-scale-apply').click();
let size = await objectSize(page, 0);
ok(close(size[0], 60) && close(size[1], 40) && close(size[2], 20), 'uniform scale doubles every axis: ' + size);
ok(close(await distance(), Math.hypot(60, 40), 0.01), 'measurement follows the object and reads the new value');
await page.keyboard.press('Control+z');
await settle(page);

// 2) one axis, exact: stretch X only so the diagonal becomes 50 → X = √(50² − 20²)
await pickCorners();
await setTarget(50);
await panel().getByRole('radio', { name: 'One axis' }).click();
ok((await panel().getByRole('radio', { name: 'X', exact: true }).getAttribute('aria-checked')) === 'true', 'default axis is the one the measurement mostly runs along (X)');
await page.getByTestId('measure-scale-apply').click();
size = await objectSize(page, 0);
ok(close(size[0], Math.sqrt(50 * 50 - 400)) && close(size[1], 20) && close(size[2], 10), 'one-axis stretch changes X only: ' + size);
ok(close(await distance(), 50, 0.01), 'diagonal is exactly the typed 50 after a one-axis stretch');
await shot(page, 'p20-scaled');

// 3) impossible one-axis request is explained, not applied
await setTarget(10);
ok(/cannot make it shorter/.test(await page.getByTestId('measure-scale-error').innerText()), 'too-short one-axis target explains why');
ok(await page.getByTestId('measure-scale-apply').isDisabled(), 'apply disabled for impossible target');

// 4) vertical edge height (Z component only) via One axis Z
await pickCorners(true);
await panel().getByRole('radio', { name: 'One axis' }).click();
await setTarget(25);
ok((await panel().getByRole('radio', { name: 'Z', exact: true }).getAttribute('aria-checked')) === 'true', 'vertical measurement defaults to Z');
await page.getByTestId('measure-scale-apply').click();
size = await objectSize(page, 0);
ok(close(size[2], 25) && close(size[1], 20), 'height set to 25 by stretching Z: ' + size);

await finish(browser, problems);
