// Arrange (bottom-left skyline packing of footprints) and align/distribute.
// Reimplemented for Mesh Studio (not ported: libnest2d is LGPL and Bambu's
// arrange works on exact polygons; bounding rectangles are enough here).
import { Vector3 } from 'three';
import { droppedToGrid, selectedObjects, useSceneStore } from '../../store/useSceneStore';
import { boxOf, worldBox } from '../../scene/geometry';
import type { SceneObject, Vec3 } from '../../scene/types';
import { useAppStore } from '../../store/useAppStore';

interface Rect { w: number; h: number; x: number; y: number }

/** Packs rectangles bottom-left into a strip of width `W` (skyline algorithm). */
export function packRects(sizes: Array<{ w: number; h: number }>, W: number): Rect[] {
  let sky: Array<{ x: number; y: number; w: number }> = [{ x: 0, y: 0, w: W }];
  return sizes.map(({ w, h }) => {
    let best: { x: number; y: number } | null = null;
    for (let i = 0; i < sky.length; i++) {
      const x = sky[i]!.x;
      if (x + w > W + 1e-9 && !(i === 0 && w > W)) continue;
      let y = 0;
      for (const s of sky) if (s.x < x + w - 1e-9 && s.x + s.w > x + 1e-9) y = Math.max(y, s.y);
      if (!best || y < best.y - 1e-9 || (Math.abs(y - best.y) <= 1e-9 && x < best.x)) best = { x, y };
    }
    const { x, y } = best!;
    // raise the skyline over [x, x + w]
    const next: typeof sky = [];
    for (const s of sky) {
      const a = s.x, b = s.x + s.w;
      if (b <= x || a >= x + w) { next.push(s); continue; }
      if (a < x) next.push({ x: a, y: s.y, w: x - a });
      if (b > x + w) next.push({ x: x + w, y: s.y, w: b - x - w });
    }
    next.push({ x, y: y + h, w });
    next.sort((p, q) => p.x - q.x);
    // merge neighbours at the same height
    sky = [];
    for (const s of next) {
      const last = sky[sky.length - 1];
      if (last && Math.abs(last.y - s.y) < 1e-9 && Math.abs(last.x + last.w - s.x) < 1e-9) last.w += s.w;
      else sky.push({ ...s });
    }
    return { w, h, x, y };
  });
}

const moved = (o: SceneObject, dx: number, dy: number, dz = 0): SceneObject => ({ ...o, position: [o.position[0] + dx, o.position[1] + dy, o.position[2] + dz] as Vec3 });

/** Packs the given objects (or all visible ones) on the grid with `spacing` mm between footprints. */
export function arrange(spacing: number) {
  const s = useSceneStore.getState();
  const targets = s.selectedIds.length > 1 ? selectedObjects(s) : s.objects.filter((o) => o.visible);
  if (!targets.length) return;
  const before = boxOf(targets).getCenter(new Vector3());
  const items = targets.map((o) => {
    const b = worldBox(o);
    return { o, b, w: b.max.x - b.min.x + spacing, h: b.max.y - b.min.y + spacing };
  });
  items.sort((p, q) => q.h - p.h || q.w - p.w);
  const area = items.reduce((a, it) => a + it.w * it.h, 0);
  const W = Math.max(Math.max(...items.map((it) => it.w)), Math.sqrt(area) * 1.15);
  const rects = packRects(items, W);
  const usedW = Math.max(...rects.map((r) => r.x + r.w)) - spacing;
  const usedH = Math.max(...rects.map((r) => r.y + r.h)) - spacing;
  const ox = before.x - usedW / 2, oy = before.y - usedH / 2;
  const next = new Map<string, SceneObject>();
  items.forEach((it, i) => {
    const r = rects[i]!;
    next.set(it.o.id, droppedToGrid(moved(it.o, ox + r.x - it.b.min.x, oy + r.y - it.b.min.y)));
  });
  s.apply(`Arrange ${targets.length} objects`, { objects: s.objects.map((o) => next.get(o.id) ?? o) });
  useAppStore.getState().setReady(`Arranged ${targets.length} object${targets.length === 1 ? '' : 's'} (${spacing} mm apart)`);
}

export type AlignMode = 'left' | 'centerX' | 'right' | 'front' | 'centerY' | 'back' | 'bottom' | 'centerZ' | 'top';

/** Aligns the selected objects' bounding boxes to the selection's box. */
export function align(mode: AlignMode) {
  const s = useSceneStore.getState();
  const sel = selectedObjects(s);
  if (sel.length < 2) return;
  const all = boxOf(sel);
  const c = all.getCenter(new Vector3());
  const next = new Map(
    sel.map((o) => {
      const b = worldBox(o);
      const bc = b.getCenter(new Vector3());
      const d = [0, 0, 0];
      if (mode === 'left') d[0] = all.min.x - b.min.x;
      if (mode === 'centerX') d[0] = c.x - bc.x;
      if (mode === 'right') d[0] = all.max.x - b.max.x;
      if (mode === 'front') d[1] = all.min.y - b.min.y;
      if (mode === 'centerY') d[1] = c.y - bc.y;
      if (mode === 'back') d[1] = all.max.y - b.max.y;
      if (mode === 'bottom') d[2] = all.min.z - b.min.z;
      if (mode === 'centerZ') d[2] = c.z - bc.z;
      if (mode === 'top') d[2] = all.max.z - b.max.z;
      return [o.id, moved(o, d[0]!, d[1]!, d[2]!)] as const;
    }),
  );
  s.apply(`Align ${mode}`, { objects: s.objects.map((o) => next.get(o.id) ?? o) });
}

/** Equal gaps between the selected objects along X or Y (outermost objects stay). */
export function distribute(axis: 'x' | 'y') {
  const s = useSceneStore.getState();
  const sel = selectedObjects(s);
  if (sel.length < 3) return;
  const items = sel.map((o) => ({ o, b: worldBox(o) })).sort((p, q) => p.b.min[axis] - q.b.min[axis]);
  const lo = items[0]!.b.min[axis], hi = Math.max(...items.map((it) => it.b.max[axis]));
  const sizes = items.reduce((a, it) => a + (it.b.max[axis] - it.b.min[axis]), 0);
  const gap = (hi - lo - sizes) / (items.length - 1);
  let cursor = lo;
  const next = new Map<string, SceneObject>();
  for (const it of items) {
    const d = cursor - it.b.min[axis];
    next.set(it.o.id, axis === 'x' ? moved(it.o, d, 0) : moved(it.o, 0, d));
    cursor += it.b.max[axis] - it.b.min[axis] + gap;
  }
  s.apply(`Distribute along ${axis.toUpperCase()}`, { objects: s.objects.map((o) => next.get(o.id) ?? o) });
}
