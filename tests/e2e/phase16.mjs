// Measure like Bambu Studio / PrusaSlicer: hover preview, snapping, edges, hole
// radius/diameter, centres, midpoints, angles with arcs, copyable values.
import { launch, ok, finish, settle, shot } from './harness.mjs';

const BASE_URL = process.argv[2] || 'http://localhost:5173/';
const { browser, page, problems } = await launch(BASE_URL);
const prim = async (kind, size) => { await page.evaluate(({ kind, size }) => window.__meshStudio.tools.addPrimitive(kind, size, 64, 0), { kind, size }); await settle(page); };
const panel = () => page.locator('[data-panel="Measure"]');
const close = (a, b, e) => Math.abs(a - b) <= e;

// box 30 × 20 × 10 with a Ø8 hole
await prim('box', [30, 20, 10]);
await prim('cylinder', [8, 8, 30]);
await page.evaluate(() => {
  const s = window.__meshStudio.scene.getState();
  const [box, cyl] = s.objects;
  s.apply('place', { objects: [box, { ...cyl, position: [box.position[0] + 5, box.position[1], box.position[2]] }], selectedIds: [box.id, cyl.id] });
});
await page.evaluate(() => window.__meshStudio.tools.runBoolean('subtract', false));
await settle(page);
const [cx, cy, top] = await page.evaluate(() => { const b = window.__meshStudio.geo.worldBox(window.__meshStudio.scene.getState().objects[0]); return [(b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, b.max.z]; });
const hx = cx + 5;

await page.getByRole('tab', { name: 'Scene' }).click();
await page.evaluate(() => window.__meshStudio.app.getState().setPanelOpen('Measure', true));
ok((await panel().getByRole('radio', { name: 'Features' }).getAttribute('aria-checked')) === 'true', 'Features mode is the default (as in Bambu Studio)');
await panel().getByRole('button', { name: /Start measuring/ }).click();
await page.evaluate(() => window.__meshStudio.app.getState().requestCamera('top', 'selection'));
await page.waitForTimeout(600);

const screen = (p) => page.evaluate((p) => window.__meshStudio.measure.viewport.project(p), p);
const hoverAt = async (p, mods = []) => {
  const [x, y] = await screen(p);
  for (const m of mods) await page.keyboard.down(m);
  await page.mouse.move(x + 0.5, y + 0.5, { steps: 2 });
  await page.waitForTimeout(120);
  const t = (await page.locator('[data-testid=measure-hover-panel]').innerText().catch(() => '')).replace(/\s+/g, ' ');
  return { t, x, y, release: async () => { for (const m of mods) await page.keyboard.up(m); } };
};
const clickAt = async (p, mods = []) => {
  const h = await hoverAt(p, mods);
  await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(120);
  await h.release();
  return h.t;
};
const pickText = (i) => page.locator(`[data-testid=measure-pick-${i}]`).innerText().catch(() => '');
const clear = () => page.evaluate(() => window.__meshStudio.measure.store.getState().set({ picks: [] }));

// ---------- hover preview ----------
let h = await hoverAt([cx - 9, cy + 2, top]);
ok(/Face/.test(h.t) && /5\.50 cm²/.test(h.t), 'hovering the top face previews it with its area (5.50 cm²): ' + h.t);
ok(await page.isVisible('[data-testid=measure-hover]'), 'hover tag in the viewport');
h = await hoverAt([cx - 8, cy - 10 + 0.05, top]);
ok(/Edge/.test(h.t) && /30/.test(h.t), 'near an edge: the 30 mm edge is previewed: ' + h.t);
h = await hoverAt([cx + 0.05, cy - 10 + 0.05, top]);
ok(/midpoint/i.test(h.t), 'at the middle of an edge: snaps to the edge midpoint: ' + h.t);
h = await hoverAt([cx - 15 + 0.1, cy - 10 + 0.1, top]);
ok(/Corner/.test(h.t), 'near a corner: snaps to the corner: ' + h.t);
h = await hoverAt([hx + 4.05, cy, top]);
ok(/Circle/.test(h.t) && /Ø 8/.test(h.t) && /R 4/.test(h.t), 'on the hole rim: circle with Ø 8 and R 4: ' + h.t);
await shot(page, 'p16-hover-circle');
h = await hoverAt([hx, cy, top]);
ok(/Centre/.test(h.t), 'over the empty hole centre: the centre point is offered: ' + h.t);

// ---------- picking: circle, then its centre against a corner ----------
await clickAt([hx + 4.05, cy, top]);
let p0 = await pickText(0);
ok(/Circle/.test(p0) && /Diameter\s*8/.test(p0) && /Radius\s*4/.test(p0), 'click picks the hole: diameter 8, radius 4');
await clickAt([cx - 15 + 0.1, cy - 10 + 0.1, top]);
let res = await page.locator('[data-testid=measure-result]').innerText();
ok(/Distance to centre\s*22\.36/.test(res) && /Distance to circle\s*18\.36/.test(res), 'corner ↔ hole: centre 22.36 mm, rim 18.36 mm: ' + res.replace(/\s+/g, ' '));
ok(await page.isVisible('[data-testid=measure-label]'), 'distance label drawn on the dimension line');
await clear();

// ---------- edge ↔ edge angle with an arc ----------
await clickAt([cx - 8, cy - 10 + 0.05, top]);
await clickAt([cx - 15 + 0.05, cy + 4, top]);
res = await page.locator('[data-testid=measure-result]').innerText();
ok(/Angle\s*90\.00°/.test(res), 'two edges: angle 90°');
ok(await page.isVisible('[data-testid=measure-angle]'), 'angle shown on an arc in the viewport');
await shot(page, 'p16-angle');
await clear();

// ---------- edge length + parallel edges ----------
await clickAt([cx - 8, cy - 10 + 0.05, top]);
p0 = await pickText(0);
ok(/Length\s*30/.test(p0), 'edge pick shows its length (30 mm)');
await clickAt([cx - 8, cy + 10 - 0.05, top]);
res = await page.locator('[data-testid=measure-result]').innerText();
ok(/Angle\s*0\.00°/.test(res) && /Distance \(parallel\)\s*20/.test(res), 'parallel edges: 0° and 20 mm apart');
await clear();

// ---------- modifiers: Alt = whole face, Shift = free point ----------
await clickAt([hx + 4.05, cy, top], ['Alt']);
ok(/Face/.test(await pickText(0)), 'Alt-click on the rim picks the face');
await clear();
await clickAt([cx - 15 + 0.1, cy - 10 + 0.1, top], ['Shift']);
const free = await page.evaluate(() => window.__meshStudio.measure.store.getState().picks[0]);
ok(free?.type === 'point' && free.snap === 'surface' && Math.abs(free.p[0] - (cx - 15)) > 0.01, 'Shift-click gives a free surface point (no corner snap)');
await clear();

// ---------- points mode with snapping ----------
await panel().getByRole('radio', { name: 'Points' }).click();
await clickAt([cx - 15 + 0.15, cy - 10 + 0.15, top]);
let pk = await page.evaluate(() => window.__meshStudio.measure.store.getState().picks[0]);
ok(pk?.snap === 'corner' && close(pk.p[0], cx - 15, 1e-4) && close(pk.p[1], cy - 10, 1e-4), 'points mode: click near a corner snaps exactly onto it');
await hoverAt([hx + 4.05, cy, top]);
await clickAt([hx + 0.3, cy + 0.3, top]);
pk = await page.evaluate(() => window.__meshStudio.measure.store.getState().picks[1]);
ok(pk?.snap === 'centre' && close(pk.p[0], hx, 1e-3) && close(pk.p[1], cy, 1e-3), 'points mode: click in a hole snaps to its centre');
res = await page.locator('[data-testid=measure-result]').innerText();
ok(/Distance\s*22\.36/.test(res) && /X \/ Y \/ Z\s*20 mm \/ 10 mm \/ 0 mm/.test(res.replace(/\s+/g, ' ')), 'corner → centre: 22.36 mm, X/Y/Z 20/10/0: ' + res.replace(/\s+/g, ' '));
await clear();
await page.locator('#ms-snap').click();
await clickAt([cx - 15 + 0.15, cy - 10 + 0.15, top]);
pk = await page.evaluate(() => window.__meshStudio.measure.store.getState().picks[0]);
ok(pk?.snap === 'surface' && !close(pk.p[0], cx - 15, 1e-3), 'snapping off: the exact clicked point is used');

// ---------- copy, selection kept ----------
ok((await page.evaluate(() => window.__meshStudio.scene.getState().selectedIds.length)) === 1, 'measuring clicks do not change the object selection');
await finish(browser, problems);
