// Gap features, batch 2: cut connectors (plug / dowel, prism / frustum, shapes,
// tolerances, click placement) and the dovetail cut (ported from Bambu Studio).
import { launch, ok, sceneState, objectSize, objectBox, reset, shot, finish, settle, errorText, dismissError } from './harness.mjs';

const BASE_URL = process.argv[2] || 'http://localhost:5173/';
const { browser, page, problems } = await launch(BASE_URL);
const analyze = (idx = -1) => page.evaluate(async (idx) => window.__meshStudio.analyze(window.__meshStudio.scene.getState().objects.at(idx)), idx);
const tab = (name) => page.getByRole('tab', { name }).click();
const cutPanel = () => page.locator('[data-panel="Cut / split"]');
const setNum = async (sel, v) => { await page.locator(sel).fill(String(v)); await page.locator(sel).press('Enter'); };
const prim = async (kind, size) => { await page.evaluate(({ kind, size }) => window.__meshStudio.tools.addPrimitive(kind, size, 64, 0), { kind, size }); await settle(page); };
const radio = (name) => cutPanel().getByRole('radio', { name, exact: true }).click();
const doCut = async () => { await cutPanel().getByRole('button', { name: 'Cut', exact: true }).click(); await settle(page); };
const startCut = async () => { await tab('Edit'); await cutPanel().getByRole('button', { name: /Start cut/ }).click(); };
const vols = async () => { const n = (await sceneState(page)).objects.length; const out = []; for (let i = 0; i < n; i++) out.push(await analyze(i)); return out; };
const close = (a, b, eps) => Math.abs(a - b) <= eps;

// ---------- plug, prism circle, automatic placement ----------
await prim('box', [40, 40, 40]);
await startCut();
await radio('Plug');
await radio('1');
await setNum('#pin-d', 6); await setNum('#pin-depth', 5); await setNum('#pin-clear', 0.15); await setNum('#pin-depth-tol', 0.1);
await doCut();
let st = await sceneState(page);
let [lower, upper] = await vols();
ok(st.objects.length === 2 && lower.manifold && upper.manifold, 'plug cut → 2 watertight parts');
const plugV = Math.PI * 9 * 5 * Math.cos(Math.PI / 64) ** 1; // 64-gon ≈ circle
ok(close(Math.abs(lower.volume), 32000 + plugV, 3), `lower part carries the plug (${Math.abs(lower.volume).toFixed(1)} mm³)`);
ok(close(Math.abs(upper.volume), 32000 - Math.PI * 3.15 ** 2 * 5.1, 3), `upper part has the socket, 0.15 mm wider and 0.1 mm deeper (${Math.abs(upper.volume).toFixed(1)} mm³)`);
ok(close((await objectSize(page, 0))[2], 25, 0.05), 'plug sticks 5 mm out of the lower cut face');
ok(upper.genus === 0 && lower.genus === 0, 'blind socket (no hole through)');
await shot(page, 'p11-plug');

// ---------- plug, frustum hexagon ----------
await reset(page);
await prim('box', [40, 40, 40]);
await startCut();
await radio('Plug'); await radio('1');
await cutPanel().getByRole('combobox', { name: 'Connector shape' }).selectOption('hexagon');
await radio('Frustum');
await setNum('#pin-d', 6); await setNum('#pin-depth', 5);
await doCut();
[lower, upper] = await vols();
const hexCone = ((3 * Math.sqrt(3)) / 2) * 9 * 5 / 3;
ok(lower.manifold && close(Math.abs(lower.volume), 32000 + hexCone, 0.5), `hexagonal frustum (cone) plug: +${(Math.abs(lower.volume) - 32000).toFixed(2)} mm³ (expected ${hexCone.toFixed(2)})`);

// ---------- dowels, square prism, two automatic ----------
await reset(page);
await prim('box', [40, 40, 40]);
await startCut();
await radio('Dowel'); await radio('2');
await cutPanel().getByRole('combobox', { name: 'Connector shape' }).selectOption('square');
await radio('Prism');
await setNum('#pin-d', 6); await setNum('#pin-depth', 5);
await doCut();
st = await sceneState(page);
ok(st.objects.length === 4, 'dowel cut → 2 halves + 2 dowels');
const dsz = await objectSize(page, 2);
ok(close(dsz[0], 6, 0.05) && close(dsz[2], 10, 0.05), 'square dowel is 6 mm across the corners × 10 mm long ' + JSON.stringify(dsz));
const dv = await analyze(2);
ok(dv.manifold && close(Math.abs(dv.volume), 2 * 9 * 10, 0.1), `square dowel volume ${Math.abs(dv.volume).toFixed(2)} mm³ (diagonal 6 → area 18)`);

// ---------- click placement ----------
await reset(page);
await prim('box', [40, 40, 40]);
await startCut();
await radio('Plug'); await radio('Click');
await cutPanel().getByRole('combobox', { name: 'Connector shape' }).selectOption('circle');
await setNum('#pin-d', 4); await setNum('#pin-depth', 4);
await page.evaluate(() => window.__meshStudio.app.getState().requestCamera('top', 'selection'));
await page.waitForTimeout(500);
const cb = await page.locator('[data-testid=viewport] canvas').boundingBox();
const cx = cb.x + cb.width / 2, cy = cb.y + cb.height / 2;
await page.mouse.click(cx - 60, cy);
await page.mouse.click(cx + 60, cy);
await page.mouse.click(cx, cy + 50);
let pts = await page.evaluate(() => window.__meshStudio.cut.getState().connectors.points);
ok(pts.length === 3 && pts.every((p) => Math.abs(p[2] - 20) < 1e-6), `three clicks place three connectors on the plane (z = ${pts.map((p) => p[2].toFixed(2)).join(', ')})`);
ok(pts[0][0] < -2 && pts[1][0] > 2, 'connectors land where clicked (left / right of centre)');
await shot(page, 'p11-click-placement');
await cutPanel().getByRole('button', { name: 'Remove last connector' }).click();
pts = await page.evaluate(() => window.__meshStudio.cut.getState().connectors.points);
ok(pts.length === 2, 'remove last connector');
await doCut();
[lower, upper] = await vols();
const plug4 = Math.PI * 4 * 4;
ok(lower.manifold && close(Math.abs(lower.volume), 32000 + 2 * plug4, 2), `two clicked plugs on the lower part (${(Math.abs(lower.volume) - 32000).toFixed(1)} mm³ added)`);
// a click outside the cut face is refused
await reset(page);
await prim('box', [20, 20, 20]);
await startCut();
await radio('Plug'); await radio('Click');
await page.evaluate(() => window.__meshStudio.cut.getState().setConnectors({ points: [[500, 500, 10]] }));
await doCut();
ok(/not on the cut face/.test((await errorText(page)) || ''), 'connector off the cut face → clear error');
ok((await sceneState(page)).objects.length === 1, 'nothing changes after the error');
await dismissError(page);
await page.keyboard.press('Escape');

// ---------- dovetail ----------
await reset(page);
await prim('box', [60, 40, 30]);
await startCut();
await radio('Dovetail');
const defaults = await page.evaluate(() => window.__meshStudio.cut.getState().groove);
ok(close(defaults.depth, Math.max(1, (60 + 40 + 30) / 60), 0.06) && close(defaults.width, defaults.depth * 4, 0.2) && defaults.flapsAngle === 60, 'dovetail defaults follow Bambu (depth from size, width 4×, 60°): ' + JSON.stringify(defaults));
await setNum('#dt-depth', 3); await setNum('#dt-width', 12); await setNum('#dt-flaps', 60); await setNum('#dt-dtol', 0.1); await setNum('#dt-wtol', 0.1);
await doCut();
st = await sceneState(page);
[lower, upper] = await vols();
const t = 1 / Math.tan(Math.PI / 3);
const hs = 0.5 * (12 + 3 * t);
const aNom = ((12 + (12 + 2 * 3 * t)) / 2) * 3;
const w = (z) => 2 * (hs - 0.05 - z * t);
const aShr = ((w(1.5) + w(-1.4)) / 2) * 2.9;
ok(st.objects.length === 2 && lower.manifold && upper.manifold, 'dovetail cut → 2 watertight parts');
ok(close(Math.abs(upper.volume), 60 * 40 * 13.5 + aShr * 40, 1), `upper part = top + tongue (${Math.abs(upper.volume).toFixed(1)} vs ${(60 * 40 * 13.5 + aShr * 40).toFixed(1)})`);
ok(close(Math.abs(lower.volume), 60 * 40 * 16.5 - aNom * 40, 1), `lower part = bottom with the groove (${Math.abs(lower.volume).toFixed(1)} vs ${(60 * 40 * 16.5 - aNom * 40).toFixed(1)})`);
await page.evaluate(() => window.__meshStudio.tools.runBoolean('intersect', false));
await settle(page);
const inter = (await errorText(page)) || (await analyze()).volume;
ok(/do not overlap|empty/i.test(String(inter)) || Math.abs(inter) < 0.01, 'tongue and groove do not overlap (intersection is empty)');
await dismissError(page);
await shot(page, 'p11-dovetail');
// groove turned 90°: the tongue now runs along X (60 mm long)
await reset(page);
await prim('box', [60, 40, 30]);
await startCut();
await radio('Dovetail');
await setNum('#dt-depth', 3); await setNum('#dt-width', 12); await setNum('#dt-angle', 90);
await doCut();
[lower, upper] = await vols();
ok(close(Math.abs(upper.volume), 60 * 40 * 13.5 + aShr * 60, 1.5), `groove direction 90°: tongue runs along X (${Math.abs(upper.volume).toFixed(1)} mm³)`);
ok(!(await errorText(page)), 'no error banner');

await finish(browser, problems);
