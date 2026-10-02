import { create } from 'zustand';

export type ViewPreset = 'fit' | 'iso' | 'front' | 'right' | 'top' | 'bottom' | 'back' | 'left';

export interface CameraRequest {
  view: ViewPreset;
  /** 'all' frames every visible object; 'selection' the selected ones. */
  target: 'all' | 'selection';
  seq: number;
}

export type LoadStatus = { kind: 'idle' } | { kind: 'loading'; name: string } | { kind: 'ready'; message: string };

export type SidebarTab = 'scene' | 'edit' | 'paint' | 'create';
export type DialogName = 'settings' | 'export' | 'shortcuts' | null;

interface AppState {
  status: LoadStatus;
  error: string | null;
  /** Non-blocking notice (warnings from tools). */
  notice: string | null;
  cameraRequest: CameraRequest;
  dialog: DialogName;
  sidebarTab: SidebarTab;
  /** Name of the active interactive tool that owns viewport clicks (cut plane, paint, lay flat…). */
  activeTool: string | null;
  busy: string | null;
  /** Sidebar section open/closed state by title (survives tab switches). */
  panelOpen: Record<string, boolean>;
  /** Show feature edges (sharper than 25°) on every object. */
  showEdges: boolean;
  toggleEdges: () => void;
  /** Overhang shading: faces within `angle`° of horizontal facing down are tinted (Bambu's support threshold angle). */
  overhang: { show: boolean; angle: number };
  /** Exploded view: 0 = assembled; >0 spreads objects away from the scene centre (display only). */
  explode: number;
  setExplode: (v: number) => void;
  setOverhang: (patch: Partial<{ show: boolean; angle: number }>) => void;
  setPanelOpen: (title: string, open: boolean) => void;

  setLoading: (name: string) => void;
  setReady: (message: string) => void;
  setError: (message: string) => void;
  dismissError: () => void;
  setNotice: (message: string | null) => void;
  requestCamera: (view: ViewPreset, target?: 'all' | 'selection') => void;
  setDialog: (d: DialogName) => void;
  setSidebarTab: (t: SidebarTab) => void;
  setActiveTool: (t: string | null) => void;
  /** Runs an async job with a busy indicator; errors become visible messages. */
  run: <T>(label: string, job: () => Promise<T>) => Promise<T | undefined>;
}

export const useAppStore = create<AppState>()((set) => ({
  status: { kind: 'idle' },
  error: null,
  notice: null,
  cameraRequest: { view: 'iso', target: 'all', seq: 0 },
  dialog: null,
  sidebarTab: 'scene',
  activeTool: null,
  busy: null,
  panelOpen: {},
  showEdges: false,
  toggleEdges: () => set((s) => ({ showEdges: !s.showEdges })),
  overhang: { show: false, angle: 30 },
  explode: 0,
  setExplode: (explode) => set({ explode }),
  setOverhang: (patch) => set((s) => ({ overhang: { ...s.overhang, ...patch } })),
  setPanelOpen: (title, open) => set((s) => ({ panelOpen: { ...s.panelOpen, [title]: open } })),

  setLoading: (name) => set({ status: { kind: 'loading', name } }),
  setReady: (message) => set({ status: { kind: 'ready', message } }),
  setError: (message) => set((s) => ({ error: message, status: s.status.kind === 'loading' ? { kind: 'idle' } : s.status })),
  dismissError: () => set({ error: null }),
  setNotice: (notice) => set({ notice }),
  requestCamera: (view, target = 'all') => set((s) => ({ cameraRequest: { view, target, seq: s.cameraRequest.seq + 1 } })),
  setDialog: (dialog) => set({ dialog }),
  setSidebarTab: (sidebarTab) => set({ sidebarTab }),
  setActiveTool: (activeTool) => set({ activeTool }),
  run: async (label, job) => {
    set({ busy: label, error: null });
    try {
      const out = await job();
      return out;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[mesh-studio] ${label} failed:`, err);
      set({ error: `${label} failed: ${msg}` });
      return undefined;
    } finally {
      set({ busy: null });
    }
  },
}));
