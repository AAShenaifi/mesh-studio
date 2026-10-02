// Phase 8: 1M-triangle performance, error handling, shortcuts panel, polish.
import { launch, ok, sceneState, objectSize, errorText, dismissError, reset, shot, finish, settle, pick } from './harness.mjs';
import { makeBigSphere } from './fixtures.mjs';

const BASE_URL = process.argv[2] || 'http://localhost:5173/';
const { browser, page, problems } = await launch(BASE_URL);
const timed = async (label, fn, budgetMs) => {
  const t0 = Date.now();
  const r = await fn();
  const ms = Date.now() - t0;
  ok(ms <= budgetMs, `${label}: ${ms} ms (budget ${budgetMs} ms)`);
  return r;
};

// ---------- 1M triangles ----------
const big = makeBigSphere();
console.log(`fixture: ${big.tris.toLocaleString()} triangles`);
await timed('load 1M-triangle STL (pick → ready)', () => pick(page, [big.path]), 15000);
let st = await sceneState(page);
ok(st.objects.length === 1 && st.objects[0].tris === big.tris, '1M triangles loaded');
// main-thread responsiveness: longest task while idle with the big mesh
const longest = await page.evaluate(() => new Promise((res) => {
  let worst = 0, last = performance.now();
  const tick = () => { const now = performance.now(); worst = Math.max(worst, now - last); last = now; };
  const id = setInterval(tick, 10);
  setTimeout(() => { clearInterval(id); res(worst); }, 3000);
}));
ok(longest < 1500, `UI stays responsive after load (longest stall ${longest.toFixed(0)} ms, includes one-time BVH build)`);
const cb = await (await page.$('[data-testid=viewport] canvas')).boundingBox();
await page.keyboard.press('Escape');
await timed('click-select on 1M mesh', async () => {
  await page.mouse.click(cb.x + cb.width / 2, cb.y + cb.height / 2);
  await page.waitForFunction(() => window.__meshStudio.scene.getState().selectedIds.length === 1);
}, 2000);
await timed('numeric move commit', async () => {
  await page.locator('#pos-x').fill('10'); await page.locator('#pos-x').press('Enter');
  await page.waitForFunction(() => window.__meshStudio.scene.getState().objects[0].position[0] === 10);
}, 2000);
await page.getByRole('tab', { name: 'Edit' }).click();
await page.getByRole('button', { name: /^Analyse/ }).click();
await timed('analysis (volume, edges, pieces) of 1M triangles', () => page.waitForSelector('[data-testid=an-volume]', { timeout: 60000 }), 20000);
ok((await page.textContent('[data-testid=an-watertight]')).startsWith('Yes'), 'big sphere watertight');
await page.getByRole('button', { name: /Start cut/ }).click();
await timed('Manifold cut of 1M triangles', async () => {
  await page.getByRole('button', { name: 'Cut', exact: true }).click();
  await settle(page, 120000);
}, 30000);
st = await sceneState(page);
ok(st.objects.length === 2, 'cut produced 2 halves');
await page.getByRole('tab', { name: 'Paint' }).click();
await page.getByRole('button', { name: 'Start painting' }).click();
await page.waitForTimeout(300);
await timed('brush stroke on ~500k-triangle half', async () => {
  await page.mouse.move(cb.x + cb.width / 2 - 40, cb.y + cb.height / 2);
  await page.mouse.down();
  await page.mouse.move(cb.x + cb.width / 2 + 40, cb.y + cb.height / 2, { steps: 8 });
  await page.mouse.up();
}, 9000);
await page.keyboard.press('Escape');
const undoMs = await page.evaluate(() => {
  const s = window.__meshStudio.scene.getState();
  const t0 = performance.now(); s.undo(); const t1 = performance.now(); window.__meshStudio.scene.getState().undo(); const t2 = performance.now();
  return [t1 - t0, t2 - t1];
});
ok(undoMs[0] < 500 && undoMs[1] < 500, `undo ×2 on big meshes (store work): ${undoMs.map((x) => x.toFixed(0)).join(' + ')} ms`);
await page.waitForFunction(() => window.__meshStudio.scene.getState().objects.length === 1);
await page.keyboard.press('Control+e');
await page.selectOption('#ex-format', 'stl');
await timed('export 1M-triangle STL', async () => {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByRole('dialog').getByRole('button', { name: /^Export / }).click()]);
  ok(dl.suggestedFilename().endsWith('.stl'), 'big STL downloaded');
}, 20000);
await shot(page, 'p8-big');
const heap = await page.evaluate(() => (performance.memory ? performance.memory.usedJSHeapSize / 1e6 : 0));
console.log(`JS heap after big-mesh session: ${heap.toFixed(0)} MB`);
await reset(page);

// ---------- error handling ----------
await page.evaluate(() => { setTimeout(() => Promise.reject(new Error('synthetic async failure')), 0); });
await page.waitForTimeout(300);
ok(/synthetic async failure/.test((await errorText(page)) || ''), 'unhandled promise rejections become a visible error');
await dismissError(page);

// ---------- shortcuts panel ----------
await page.keyboard.press('?');
const dlg = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
ok(await dlg.isVisible(), '? opens the shortcuts panel');
const txt = await dlg.textContent();
ok(['Ctrl+Z', 'W / E / R', 'Paint mode', 'Cut tool', 'Lay flat'].every((k) => txt.includes(k)), 'shortcuts panel lists the main keys');
await page.keyboard.press('Escape');
await pick(page, ['box.stl']);
await page.keyboard.press('p');
ok(await page.evaluate(() => window.__meshStudio.app.getState().activeTool === 'paint'), 'P toggles paint mode');
await page.keyboard.press('p');
await page.keyboard.press('x');
ok(await page.evaluate(() => window.__meshStudio.app.getState().activeTool === 'cut'), 'X starts the cut tool on the selection');
await page.keyboard.press('Escape');

// ---------- STL Studio parity extras: edges overlay + measure ----------
await reset(page);
await pick(page, ['box.stl']);
await page.keyboard.press('Escape');
await page.keyboard.press('k');
ok(await page.evaluate(() => window.__meshStudio.app.getState().showEdges), 'K toggles feature edges');
await shot(page, 'p8-edges');
await page.keyboard.press('k');
await page.evaluate(() => window.__meshStudio.app.getState().requestCamera('front', 'all'));
await page.waitForTimeout(300);
await page.evaluate(() => window.__meshStudio.measure.store.getState().set({ mode: 'points' }));
await page.keyboard.press('m');
const c2 = await (await page.$('[data-testid=viewport] canvas')).boundingBox();
await page.mouse.click(c2.x + c2.width / 2 - 60, c2.y + c2.height / 2);
await page.mouse.click(c2.x + c2.width / 2 + 60, c2.y + c2.height / 2 + 30);
await page.waitForTimeout(300);
const status = await page.textContent('[data-testid=status-text]');
ok(/Distance [\d.]+ mm/.test(status) && /Distance X \/ Y \/ Z [\d.]+ mm \/ 0 mm \//.test(status), 'measure: two points on the front face, ΔY = 0: ' + status);
ok(await page.isVisible('[data-testid=measure-label]'), 'distance label in the viewport');
await shot(page, 'p8-measure');
await page.keyboard.press('Escape');
ok(!(await page.isVisible('[data-testid=measure-label]').catch(() => false)), 'Esc ends measuring');

await finish(browser, problems.filter((p) => !/synthetic async failure/.test(p)));
