// Phase 22: the distance label on the model is clickable and opens the "type a new size" box; Measure opens by itself.
import { launch, ok, finish, settle, shot, objectSize } from './harness.mjs';

const BASE_URL = process.argv[2] || 'http://localhost:5173/';
const { browser, page, problems } = await launch(BASE_URL);
const close = (a, b, e = 0.02) => Math.abs(a - b) <= e;
await page.evaluate(() => window.__meshStudio.tools.addPrimitive('box', [30, 20, 10], 64, 0));
await settle(page);
await page.keyboard.press('m'); // start measuring from the keyboard; the Measure section must open on its own
await settle(page);
ok(await page.locator('[data-panel="Measure"]').evaluate((d) => d.open), 'Measure section opens by itself when measuring starts');

await page.evaluate(() => {
  const o = window.__meshStudio.scene.getState().objects[0];
  const b = window.__meshStudio.geo.worldBox(o);
  const p = (x, y, z) => ({ objectId: o.id, type: 'point', p: [x, y, z], snap: 'corner' });
  window.__meshStudio.measure.store.getState().set({ picks: [p(b.min.x, b.min.y, b.max.z), p(b.max.x, b.min.y, b.max.z)] });
});
await settle(page);
const label = page.getByTestId('measure-label');
await label.waitFor();
ok(/30/.test(await label.innerText()), 'label shows the 30 mm edge: ' + (await label.innerText()).trim());
await label.click();
await page.getByTestId('measure-label-editor').waitFor();
ok(true, 'clicking the label opens the editor on the model');
await shot(page, 'p22-label-editor');
const ed = page.getByTestId('measure-label-editor');
await ed.locator('#lbl-target').fill('45');
await ed.locator('#lbl-target').press('Enter');
await ed.getByTestId('measure-scale-apply').click();
const size = await objectSize(page, 0);
ok(close(size[0], 45) && close(size[1], 30) && close(size[2], 15), 'typed 45 on the label scales the box uniformly: ' + size);
await page.getByTestId('measure-label-editor').getByRole('button', { name: 'Close' }).click();
ok(await page.getByTestId('measure-label').isVisible(), 'closing the editor shows the label again');
await finish(browser, problems);
