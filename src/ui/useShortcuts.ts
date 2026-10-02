import { useEffect } from 'react';
import { Vector3 } from 'three';
import { resetPlane } from '../features/cut/CutPanel';
import { useAppStore } from '../store/useAppStore';
import { useSceneStore } from '../store/useSceneStore';
import { useSettingsStore } from '../store/useSettingsStore';

export interface Shortcut {
  keys: string;
  description: string;
  group: string;
}

/** Shown in the shortcuts panel. Keep in sync with the handler below. */
export const SHORTCUTS: Shortcut[] = [
  { group: 'File', keys: 'Ctrl+O', description: 'Open files' },
  { group: 'File', keys: 'Ctrl+E', description: 'Export' },
  { group: 'Edit', keys: 'Ctrl+Z', description: 'Undo' },
  { group: 'Edit', keys: 'Ctrl+Y / Ctrl+Shift+Z', description: 'Redo' },
  { group: 'Edit', keys: 'Ctrl+D', description: 'Duplicate selection' },
  { group: 'Edit', keys: 'Delete / Backspace', description: 'Delete selection' },
  { group: 'Edit', keys: 'Ctrl+A', description: 'Select all' },
  { group: 'Edit', keys: 'Esc', description: 'Deselect / leave the active tool' },
  { group: 'Edit', keys: 'H', description: 'Hide / show selection' },
  { group: 'Transform', keys: 'W / E / R', description: 'Move / rotate / scale gizmo' },
  { group: 'Transform', keys: 'D', description: 'Drop selection to grid' },
  { group: 'Transform', keys: 'C', description: 'Center selection on origin' },
  { group: 'Transform', keys: 'S', description: 'Toggle snapping' },
  { group: 'Tools', keys: 'P', description: 'Paint mode on / off (left-drag paints, right-drag orbits)' },
  { group: 'Tools', keys: 'X', description: 'Cut tool on the selected object' },
  { group: 'Tools', keys: 'L', description: 'Lay flat: click a face to put it down' },
  { group: 'View', keys: 'F / Shift+F', description: 'Frame selection / everything' },
  { group: 'View', keys: '0 / 1 / 3 / 7', description: 'Iso / front / right / top view' },
  { group: 'View', keys: 'G', description: 'Toggle grid' },
  { group: 'View', keys: 'K', description: 'Toggle feature edges' },
  { group: 'Tools', keys: 'M', description: 'Measure: click two points' },
  { group: 'View', keys: '?', description: 'This shortcuts panel' },
];

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

export function useShortcuts(extra?: (e: KeyboardEvent) => boolean) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.defaultPrevented) return;
      const app = useAppStore.getState();
      const scene = useSceneStore.getState();
      if (app.dialog && e.key !== 'Escape') return;
      if (extra?.(e)) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      const run = (fn: () => void) => {
        e.preventDefault();
        fn();
      };
      if (mod && k === 'z' && !e.shiftKey) return run(scene.undo);
      if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) return run(scene.redo);
      if (mod && k === 'd') return run(scene.duplicateSelected);
      if (mod && k === 'a') return run(scene.selectAll);
      if (mod && k === 'e') return run(() => scene.objects.length && app.setDialog('export'));
      if (mod && k === 'o') return run(() => void import('../loaders/pickFiles').then((m) => m.pickFiles()));
      if (mod || e.altKey) return;
      if (k === 'delete' || k === 'backspace') return run(scene.removeSelected);
      if (k === 'escape') {
        if (app.activeTool) return run(() => app.setActiveTool(null));
        return run(scene.clearSelection);
      }
      if (k === 'm') return run(() => app.setActiveTool(app.activeTool === 'measure' ? null : 'measure'));
      if (k === 'k') return run(app.toggleEdges);
      if (k === 'p') return run(() => app.setActiveTool(app.activeTool === 'paint' ? null : 'paint'));
      if (k === 'l') return run(() => app.setActiveTool(app.activeTool === 'layflat' ? null : 'layflat'));
      if (k === 'x') {
        return run(() => {
          const o = scene.objects.find((x) => x.id === scene.selectedIds[0]);
          if (scene.selectedIds.length !== 1 || !o) return app.setNotice('Select one object to cut.');
          resetPlane(o, new Vector3(0, 0, 1));
          app.setSidebarTab('edit');
          app.setActiveTool('cut');
        });
      }
      if (k === 'w') return run(() => scene.setGizmoMode('translate'));
      if (k === 'e') return run(() => scene.setGizmoMode('rotate'));
      if (k === 'r') return run(() => scene.setGizmoMode('scale'));
      if (k === 'd') return run(scene.dropSelectedToGrid);
      if (k === 'c') return run(scene.centerSelected);
      if (k === 's') return run(() => useSettingsStore.getState().update({ snap: !useSettingsStore.getState().snap }));
      if (k === 'g') return run(() => useSettingsStore.getState().update({ gridVisible: !useSettingsStore.getState().gridVisible }));
      if (k === 'h') {
        return run(() => {
          const sel = scene.objects.filter((o) => scene.selectedIds.includes(o.id));
          if (!sel.length) return;
          const show = sel.some((o) => !o.visible);
          scene.apply(show ? 'Show' : 'Hide', { objects: scene.objects.map((o) => (scene.selectedIds.includes(o.id) ? { ...o, visible: show } : o)) });
        });
      }
      if (k === 'f') return run(() => app.requestCamera('fit', e.shiftKey || !scene.selectedIds.length ? 'all' : 'selection'));
      const views: Record<string, Parameters<typeof app.requestCamera>[0]> = { '0': 'iso', '1': 'front', '3': 'right', '7': 'top' };
      if (views[e.key]) return run(() => app.requestCamera(views[e.key]!));
      if (e.key === '?') return run(() => app.setDialog('shortcuts'));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [extra]);
}
