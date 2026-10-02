import { create } from 'zustand';
import { Euler, Matrix4, Quaternion, Vector3, type BufferGeometry } from 'three';
import { DEFAULT_PALETTE } from '../scene/palette';
import { boxOf, worldBox, writeColors } from '../scene/geometry';
import type { SceneObject, Vec3 } from '../scene/types';

export interface Snapshot {
  objects: SceneObject[];
  palette: string[];
  selectedIds: string[];
}

interface HistoryEntry {
  label: string;
  snap: Snapshot;
}

export type GizmoMode = 'translate' | 'rotate' | 'scale';

const HISTORY_LIMIT = 60;

interface SceneState extends Snapshot {
  past: HistoryEntry[];
  future: HistoryEntry[];
  gizmoMode: GizmoMode;
  /** Bumped whenever geometry colours change outside of a record swap (painting). */
  paintVersion: number;

  /** Records an undoable change. Anything not given keeps its current value. */
  /** `merge`: fold into the previous step when it has the same label (colour-picker drags, slider scrubs). */
  apply: (label: string, next: Partial<Snapshot>, merge?: boolean) => void;
  undo: () => void;
  redo: () => void;
  select: (ids: string[], mode?: 'replace' | 'toggle' | 'add') => void;
  selectAll: () => void;
  clearSelection: () => void;
  setGizmoMode: (mode: GizmoMode) => void;
  /** Replaces one object's record (undoable). */
  updateObject: (label: string, id: string, patch: Partial<SceneObject>) => void;
  addObjects: (label: string, objects: SceneObject[], select?: boolean) => void;
  removeSelected: () => void;
  duplicateSelected: () => void;
  dropSelectedToGrid: () => void;
  centerSelected: () => void;
  setPalette: (label: string, palette: string[]) => void;
  /** Removes `removeIds` and adds `added` as one undo step, selecting the added objects. */
  replaceObjects: (label: string, removeIds: string[], added: SceneObject[]) => void;
  clearScene: () => void;
}

let idCounter = 0;
export const newId = () => `obj-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

/** Every geometry reachable from the scene or history. Others are freed. */
const known = new Set<BufferGeometry>();
/** Triangles kept alive only by undo history; beyond this the oldest steps are dropped (≈ 25 bytes/triangle). */
const HISTORY_TRIANGLE_BUDGET = 24_000_000;

function trimHistory(state: Pick<SceneState, 'objects' | 'past' | 'future'>): HistoryEntry[] {
  const current = new Set(state.objects.map((o) => o.geometry));
  const counted = new Set<BufferGeometry>();
  let total = 0;
  for (const h of state.future) for (const o of h.snap.objects) {
    if (current.has(o.geometry) || counted.has(o.geometry)) continue;
    counted.add(o.geometry);
    total += o.faceColors.length;
  }
  // newest first, keep while under budget
  let keepFrom = 0;
  for (let i = state.past.length - 1; i >= 0; i--) {
    for (const o of state.past[i]!.snap.objects) {
      if (current.has(o.geometry) || counted.has(o.geometry)) continue;
      counted.add(o.geometry);
      total += o.faceColors.length;
    }
    if (total > HISTORY_TRIANGLE_BUDGET) {
      keepFrom = i + 1;
      break;
    }
  }
  return keepFrom ? state.past.slice(keepFrom) : state.past;
}

function collectGarbage(state: Pick<SceneState, 'objects' | 'past' | 'future'>) {
  const live = new Set<BufferGeometry>();
  for (const o of state.objects) live.add(o.geometry);
  for (const h of [...state.past, ...state.future]) for (const o of h.snap.objects) live.add(o.geometry);
  for (const g of known) {
    if (!live.has(g)) {
      (g as BufferGeometry & { disposeBoundsTree?: () => void }).disposeBoundsTree?.();
      g.dispose();
      known.delete(g);
    }
  }
  for (const g of live) known.add(g);
}

/** Keeps linked copies in sync: new colours spread to the whole link group; a copy whose mesh changed leaves its group. */
function propagateLinks(prev: SceneObject[], next: SceneObject[]): SceneObject[] {
  if (!next.some((o) => o.linkId)) return next;
  const before = new Map(prev.map((o) => [o.id, o]));
  const colours = new Map<string, Uint16Array>();
  let out = next.map((o) => {
    if (!o.linkId) return o;
    const p = before.get(o.id);
    if (p && p.geometry !== o.geometry) return { ...o, linkId: undefined };
    if (p && p.faceColors !== o.faceColors) colours.set(o.linkId, o.faceColors);
    return o;
  });
  if (colours.size) out = out.map((o) => (o.linkId && colours.has(o.linkId) && o.faceColors !== colours.get(o.linkId) ? { ...o, faceColors: colours.get(o.linkId)! } : o));
  // a group of one is no longer linked
  const counts = new Map<string, number>();
  for (const o of out) if (o.linkId) counts.set(o.linkId, (counts.get(o.linkId) ?? 0) + 1);
  return out.map((o) => (o.linkId && counts.get(o.linkId) === 1 ? { ...o, linkId: undefined } : o));
}

const snapshotOf = (s: Snapshot): Snapshot => ({ objects: s.objects, palette: s.palette, selectedIds: s.selectedIds });

/** Palette changes rewrite the colour attribute of every geometry they affect. */
function refreshColors(objects: SceneObject[], palette: string[]) {
  for (const o of objects) writeColors(o.geometry, o.faceColors, palette);
}

/** Moves an object so its world bounding box sits on z = 0. */
export function droppedToGrid(o: SceneObject): SceneObject {
  const box = worldBox(o);
  return { ...o, position: [o.position[0], o.position[1], o.position[2] - box.min.z] };
}

export const useSceneStore = create<SceneState>()((set, get) => ({
  objects: [],
  palette: [...DEFAULT_PALETTE],
  selectedIds: [],
  past: [],
  future: [],
  gizmoMode: 'translate',
  paintVersion: 0,

  apply: (label, next, merge = false) => {
    const s = get();
    const top = s.past[s.past.length - 1];
    const past = merge && top?.label === label && !s.future.length ? s.past : [...s.past, { label, snap: snapshotOf(s) }].slice(-HISTORY_LIMIT);
    const objects = next.objects ? propagateLinks(s.objects, next.objects) : s.objects;
    const ids = new Set(objects.map((o) => o.id));
    const selectedIds = (next.selectedIds ?? s.selectedIds).filter((id) => ids.has(id));
    if (next.palette && next.palette !== s.palette) refreshColors(objects, next.palette);
    set({ objects, palette: next.palette ?? s.palette, selectedIds, past, future: [] });
    const trimmed = trimHistory(get());
    if (trimmed !== get().past) set({ past: trimmed });
    collectGarbage(get());
  },
  undo: () => {
    const s = get();
    const entry = s.past[s.past.length - 1];
    if (!entry) return;
    const future = [{ label: entry.label, snap: snapshotOf(s) }, ...s.future];
    // Geometry colour attributes are shared with history records; rewrite them for the restored state.
    refreshColors(entry.snap.objects, entry.snap.palette);
    set({ ...entry.snap, past: s.past.slice(0, -1), future, paintVersion: s.paintVersion + 1 });
  },
  redo: () => {
    const s = get();
    const entry = s.future[0];
    if (!entry) return;
    const past = [...s.past, { label: entry.label, snap: snapshotOf(s) }];
    refreshColors(entry.snap.objects, entry.snap.palette);
    set({ ...entry.snap, past, future: s.future.slice(1), paintVersion: s.paintVersion + 1 });
  },
  select: (ids, mode = 'replace') => {
    const cur = get().selectedIds;
    if (mode === 'replace') set({ selectedIds: ids });
    else if (mode === 'add') set({ selectedIds: [...cur.filter((i) => !ids.includes(i)), ...ids] });
    else {
      const next = [...cur];
      for (const id of ids) {
        const at = next.indexOf(id);
        if (at >= 0) next.splice(at, 1);
        else next.push(id);
      }
      set({ selectedIds: next });
    }
  },
  selectAll: () => set({ selectedIds: get().objects.filter((o) => o.visible).map((o) => o.id) }),
  clearSelection: () => set({ selectedIds: [] }),
  setGizmoMode: (gizmoMode) => set({ gizmoMode }),

  updateObject: (label, id, patch) => {
    const objects = get().objects.map((o) => (o.id === id ? { ...o, ...patch } : o));
    get().apply(label, { objects });
  },
  addObjects: (label, added, select = true) => {
    const s = get();
    for (const o of added) writeColors(o.geometry, o.faceColors, s.palette);
    s.apply(label, { objects: [...s.objects, ...added], selectedIds: select ? added.map((o) => o.id) : s.selectedIds });
  },
  removeSelected: () => {
    const s = get();
    if (!s.selectedIds.length) return;
    const n = s.selectedIds.length;
    s.apply(n === 1 ? 'Delete object' : `Delete ${n} objects`, {
      objects: s.objects.filter((o) => !s.selectedIds.includes(o.id)),
      selectedIds: [],
    });
  },
  duplicateSelected: () => {
    const s = get();
    const sel = s.objects.filter((o) => s.selectedIds.includes(o.id));
    if (!sel.length) return;
    const box = boxOf(sel);
    const dx = box.max.x - box.min.x + 5;
    // Each copy owns its geometry so painting one never recolours the other.
    const copies = sel.map((o) => ({
      ...o,
      geometry: o.geometry.clone(),
      faceColors: o.faceColors.slice(),
      linkId: undefined,
      id: newId(),
      name: `${o.name} copy`,
      position: [o.position[0] + dx, o.position[1], o.position[2]] as Vec3,
      source: { ...o.source },
    }));
    s.apply(sel.length === 1 ? 'Duplicate' : `Duplicate ${sel.length} objects`, {
      objects: [...s.objects, ...copies],
      selectedIds: copies.map((c) => c.id),
    });
  },
  dropSelectedToGrid: () => {
    const s = get();
    if (!s.selectedIds.length) return;
    s.apply('Drop to grid', { objects: s.objects.map((o) => (s.selectedIds.includes(o.id) ? droppedToGrid(o) : o)) });
  },
  centerSelected: () => {
    const s = get();
    const sel = s.objects.filter((o) => s.selectedIds.includes(o.id));
    if (!sel.length) return;
    const c = boxOf(sel).getCenter(new Vector3());
    s.apply('Center on origin', {
      objects: s.objects.map((o) =>
        s.selectedIds.includes(o.id) ? { ...o, position: [o.position[0] - c.x, o.position[1] - c.y, o.position[2]] } : o,
      ),
    });
  },
  setPalette: (label, palette) => get().apply(label, { palette }),
  replaceObjects: (label, removeIds, added) => {
    const s = get();
    for (const o of added) writeColors(o.geometry, o.faceColors, s.palette);
    s.apply(label, { objects: [...s.objects.filter((o) => !removeIds.includes(o.id)), ...added], selectedIds: added.map((o) => o.id) });
  },
  clearScene: () => get().apply('Clear scene', { objects: [], selectedIds: [] }),
}));

export const selectedObjects = (s: Pick<SceneState, 'objects' | 'selectedIds'>) =>
  s.selectedIds.map((id) => s.objects.find((o) => o.id === id)).filter((o): o is SceneObject => !!o);

/** Applies a world-space matrix on top of an object's transform (e.g. lay flat, mirror). */
export function withWorldTransform(o: SceneObject, m: Matrix4): Pick<SceneObject, 'position' | 'rotation' | 'scale'> {
  const cur = new Matrix4().compose(
    new Vector3(...o.position),
    new Quaternion().setFromEuler(new Euler(...o.rotation, 'XYZ')),
    new Vector3(...o.scale),
  );
  const next = m.clone().multiply(cur);
  const p = new Vector3(), q = new Quaternion(), sc = new Vector3();
  next.decompose(p, q, sc);
  const e = new Euler().setFromQuaternion(q, 'XYZ');
  return { position: p.toArray() as Vec3, rotation: [e.x, e.y, e.z], scale: sc.toArray() as Vec3 };
}
