// Gap features, batch 4: feature measuring (planes, edges, circles, points) ported from Bambu's Measure.cpp.
import { launch, ok, reset, shot, finish, settle } from './harness.mjs';

const BASE_URL = process.argv[2] || 'http://localhost:5173/';
const { browser, page, problems } = await launch(BASE_URL);
const prim = async (kind, size) => { await page.evaluate(({ kind, size }) => window.__meshStudio.tools.addPrimitive(kind, size, 64, 0), { kind, size }); await settle(page); };
const close = (a, b, eps) => Math.abs(a - b) <= eps;

// box 30 × 20 × 10 with a Ø8 hole through it (64-sided cylinder subtracted)
await prim('box', [30, 20, 10]);
await prim('cylinder', [8, 8, 30]);
await page.evaluate(() => {
  const s = window.__meshStudio.scene.getState();
  const [box, cyl] = s.objects;
  s.apply('place', { objects: [box, { ...cyl, position: [box.position[0] + 5, box.position[1], box.position[2]] }], selectedIds: [box.id, cyl.id] });
});
await page.evaluate(() => window.__meshStudio.tools.runBoolean('subtract', false));
await settle(page);

/** Picks the feature of the first triangle facing `normal` that contains a vertex matching `where`, at `point`. */
const pick = (normal, where, point, limit = 0.5, onlyPlane = false) => page.evaluate(({ normal, where, point, limit, onlyPlane }) => {
  const { scene, geo, measure } = window.__meshStudio;
  const o = scene.getState().objects[0];
  const p = geo.worldPositions(o);
  const match = new Function('x', 'y', 'z', `return ${where};`);
  for (let t = 0; t < p.length / 9; t++) {
    const ax = p[t * 9 + 3] - p[t * 9], ay = p[t * 9 + 4] - p[t * 9 + 1], az = p[t * 9 + 5] - p[t * 9 + 2];
    const bx = p[t * 9 + 6] - p[t * 9], by = p[t * 9 + 7] - p[t * 9 + 1], bz = p[t * 9 + 8] - p[t * 9 + 2];
    const n = [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
    const l = Math.hypot(...n);
    if (!l || n.reduce((s, c, i) => s + (c / l) * normal[i], 0) < 0.999) continue;
    for (let k = 0; k < 3; k++) {
      const x = p[t * 9 + k * 3], y = p[t * 9 + k * 3 + 1], z = p[t * 9 + k * 3 + 2];
      if (match(x, y, z)) {
        const at = point ? point : [x, y, z];
        const THREE_V = { x: at[0], y: at[1], z: at[2], clone() { return { ...this, applyMatrix4: (m) => { const e = m.elements; return { toArray: () => [e[0] * at[0] + e[4] * at[1] + e[8] * at[2] + e[12], e[1] * at[0] + e[5] * at[1] + e[9] * at[2] + e[13], e[2] * at[0] + e[6] * at[1] + e[10] * at[2] + e[14]] }; } }; } };
        const f = measure.pickFeature(o, t, THREE_V, limit, onlyPlane);
        return f ? JSON.parse(JSON.stringify({ ...f, triangles: f.triangles?.length })) : null;
      }
    }
  }
  return 'no triangle';
}, { normal, where, point, limit, onlyPlane });
const centre = await page.evaluate(() => { const b = window.__meshStudio.geo.worldBox(window.__meshStudio.scene.getState().objects[0]); return [(b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, b.max.z, b.min.z]; });
const [cx, cy, top, bottom] = centre;
const hx = cx + 5;

// circle: click on the top face right on the rim of the hole
const circle = await pick([0, 0, 1], `Math.abs(Math.hypot(x - ${hx}, y - ${cy}) - 4) < 1e-3 && Math.abs(z - ${top}) < 1e-3`);
ok(circle && circle.type === 'circle' && close(circle.radius * 2, 8, 0.01) && close(circle.center[0], hx, 0.01) && close(circle.center[1], cy, 0.01), 'hole rim is detected as a Ø8 circle at the hole centre: ' + JSON.stringify(circle && { type: circle.type, d: circle.radius * 2 }));
// plane: middle of the top face, far from edges
const topPlane = await pick([0, 0, 1], `Math.abs(z - ${top}) < 1e-3`, [cx - 9, cy, top]);
ok(topPlane && topPlane.type === 'plane' && close(topPlane.normal[2], 1, 1e-6), 'click inside the top face picks the face');
const bottomPlane = await pick([0, 0, -1], `Math.abs(z - ${bottom}) < 1e-3`, [cx - 9, cy, bottom]);
// edge: on the long top edge (y = min) away from corners
const edge1 = await pick([0, 0, 1], `Math.abs(z - ${top}) < 1e-3 && Math.abs(y - ${cy - 10}) < 1e-3`, [cx - 3, cy - 10, top]);
ok(edge1 && edge1.type === 'edge' && close(Math.hypot(edge1.b[0] - edge1.a[0], edge1.b[1] - edge1.a[1], edge1.b[2] - edge1.a[2]), 30, 0.01), 'click on a box edge picks the 30 mm edge (collinear pieces merged)');
const edge2 = await pick([0, 0, 1], `Math.abs(z - ${top}) < 1e-3 && Math.abs(x - ${cx - 15}) < 1e-3`, [cx - 15, cy + 2, top]);
// corner snaps to a point
const corner = await pick([0, 0, 1], `Math.abs(z - ${top}) < 1e-3 && Math.abs(x - ${cx - 15}) < 1e-3 && Math.abs(y - ${cy - 10}) < 1e-3`, [cx - 14.95, cy - 9.95, top]);
ok(corner && corner.type === 'point' && close(corner.p[0], cx - 15, 1e-3), 'click next to a corner snaps to the corner point');
// side face
const side = await pick([0, -1, 0], `Math.abs(y - ${cy - 10}) < 1e-3`, [cx - 9, cy - 10, (top + bottom) / 2]);

const m = (a, b) => page.evaluate(({ a, b }) => window.__meshStudio.measure.measure(a, b, (v) => v.toFixed(3)), { a, b });
let r = await m(topPlane, bottomPlane);
ok(close(r.distance, 10, 1e-4) && r.angle === 0, 'top ↔ bottom face: parallel, 10 mm apart');
r = await m(topPlane, side);
ok(close(r.angle, 90, 1e-3), 'top ↔ side face: 90° between faces');
r = await m(edge1, edge2);
ok(close(r.angle, 90, 1e-3), 'edge ↔ edge: 90°');
r = await m(circle, bottomPlane);
ok(close(r.distance, 10, 1e-4), 'hole centre (top) ↔ bottom face: 10 mm');
r = await m(corner, circle);
ok(close(r.distance, Math.hypot(20, 10), 1e-3), `corner ↔ hole centre: ${r.distance?.toFixed(3)} mm`);
const whole = await pick([0, 0, 1], `Math.abs(Math.hypot(x - ${hx}, y - ${cy}) - 4) < 1e-3 && Math.abs(z - ${top}) < 1e-3`, null, 0.5, true);
ok(whole && whole.type === 'plane', 'only-plane (Alt) picks the face even on the rim');

// ---------- UI: features mode, click the top face from above ----------
await page.getByRole('tab', { name: 'Scene' }).click();
await page.evaluate(() => window.__meshStudio.app.getState().setPanelOpen('Measure', true));
await page.locator('[data-panel="Measure"]').getByRole('radio', { name: 'Features' }).click();
await page.mouse.move(1, 1);
await page.locator('[data-panel="Measure"]').getByRole('button', { name: /Start measuring/ }).click();
await page.evaluate(() => window.__meshStudio.app.getState().requestCamera('top', 'selection'));
await page.waitForTimeout(500);
const cb = await page.locator('[data-testid=viewport] canvas').boundingBox();
await page.mouse.click(cb.x + cb.width / 2 - 120, cb.y + cb.height / 2);
await page.waitForTimeout(200);
ok(/Face/.test(await page.locator('[data-testid=measure-pick-0]').innerText()), 'UI: clicking the top face picks a face');
await page.mouse.click(cb.x + cb.width / 2 - 40, cb.y + cb.height / 2 + 80);
await page.waitForTimeout(200);
const resText = await page.locator('[data-testid=measure-pick-1]').innerText().catch(() => '');
ok(/Circle|Face|Edge|Point/.test(resText), 'UI: second click picks another feature: ' + resText.split('\n')[0]);
await shot(page, 'p13-measure');

await finish(browser, problems);
