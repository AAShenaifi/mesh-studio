// Shared Playwright helpers for the phase tests.
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FIX, makeFixtures } from './fixtures.mjs';

const PW = process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs';
const { chromium } = await import(PW);

export const SHOTS = process.env.SHOTS_DIR || join(tmpdir(), 'mesh-studio-shots');
mkdirSync(SHOTS, { recursive: true });
makeFixtures();
export { FIX };

let failures = 0;
export function ok(cond, msg) {
  console.log((cond ? 'PASS ' : 'FAIL ') + msg);
  if (!cond) failures++;
}
export const failed = () => failures;

export async function launch(url) {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  const problems = [];
  const origin = new URL(url).origin;
  page.on('console', (m) => {
    const t = m.text();
    if ((m.type() === 'error' || m.type() === 'warning') && !/THREE\.Clock|load failed:|failed: /.test(t)) problems.push(`${m.type()}: ${t} [on ${page.url()}]`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message} [on ${page.url()}]`));
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:')) problems.push(`external request: ${u} [on ${page.url()}]`);
  });
  await page.goto(url);
  await page.waitForSelector('canvas');
  await page.waitForFunction(() => window.__meshStudio);
  return { browser, page, problems };
}

export const state = (page, fn) => page.evaluate(fn);
export const sceneState = (page) =>
  page.evaluate(() => {
    const s = window.__meshStudio.scene.getState();
    return {
      objects: s.objects.map((o) => ({ id: o.id, name: o.name, tris: o.faceColors.length, position: o.position, rotation: o.rotation, scale: o.scale, visible: o.visible })),
      selectedIds: s.selectedIds, past: s.past.length, future: s.future.length,
    };
  });

/** World bbox size of an object, rounded to 0.01. */
export const objectSize = (page, index = -1) =>
  page.evaluate((index) => {
    const s = window.__meshStudio.scene.getState();
    const o = s.objects.at(index);
    if (!o) return null;
    const box = window.__meshStudio.geo.worldBox(o);
    return [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z].map((v) => Math.round(v * 100) / 100);
  }, index);

export const objectBox = (page, index = -1) =>
  page.evaluate((index) => {
    const o = window.__meshStudio.scene.getState().objects.at(index);
    const b = window.__meshStudio.geo.worldBox(o);
    const r = (v) => Math.round(v * 100) / 100;
    return { min: [r(b.min.x), r(b.min.y), r(b.min.z)], max: [r(b.max.x), r(b.max.y), r(b.max.z)] };
  }, index);

export async function pick(page, files) {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Open', exact: true }).click()]);
  await chooser.setFiles(files.map((f) => (f.includes('/') || f.includes('\\') ? f : join(FIX, f))));
  await settle(page);
}

export async function drop(page, files) {
  const payload = files.map((f) => ({ name: f.split(/[\\/]/).pop(), b64: readFileSync(f.includes('/') ? f : join(FIX, f)).toString('base64') }));
  await page.evaluate((payload) => {
    const dt = new DataTransfer();
    for (const f of payload) dt.items.add(new File([Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0))], f.name));
    const target = document.querySelector('canvas');
    target.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }));
    target.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
    target.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, payload);
  await settle(page);
}

/** Waits until no load or tool job is running. */
export async function settle(page, timeout = 60000) {
  await page.waitForTimeout(150);
  await page.waitForFunction(() => {
    const a = window.__meshStudio.app.getState();
    return a.status.kind !== 'loading' && !a.busy;
  }, null, { timeout });
  await page.waitForTimeout(150);
}

export const errorText = async (page) => {
  const el = await page.$('[role=alert]');
  return el ? el.textContent() : null;
};
export const dismissError = (page) => page.evaluate(() => window.__meshStudio.app.getState().dismissError());
export const reset = (page) =>
  page.evaluate(() => {
    const s = window.__meshStudio.scene;
    s.setState({ objects: [], selectedIds: [], past: [], future: [] });
    window.__meshStudio.app.getState().dismissError();
    window.__meshStudio.app.getState().setNotice(null);
  });

export async function shot(page, name) {
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(SHOTS, name + '.png') });
}

export async function finish(browser, problems) {
  console.log('--- console problems ---\n' + (problems.join('\n') || '(none)'));
  ok(problems.length === 0, 'no console errors, page errors or external requests');
  await browser.close();
  console.log(`\n${failures ? failures + ' FAILED' : 'ALL PASSED'}`);
  process.exitCode = failures ? 1 : 0;
}
