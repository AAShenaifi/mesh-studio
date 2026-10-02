import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DEFAULT_SETTINGS, LIMITS, type Settings } from '../settings/defaults';
import { UNITS } from '../settings/units';
import { safeStorage } from '../settings/safeStorage';

interface SettingsActions {
  update: (patch: Partial<Settings>) => void;
  reset: () => void;
}

export type SettingsState = Settings & SettingsActions;

const HEX = /^#[0-9a-f]{6}$/i;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Drops anything malformed (hand-edited storage, older versions) back to defaults. */
export function sanitizeSettings(raw: unknown): Settings {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof Settings, unknown>>;
  const d = DEFAULT_SETTINGS;
  const bool = (v: unknown, def: boolean) => (typeof v === 'boolean' ? v : def);
  const num = (v: unknown, def: number, lim: { min: number; max: number }) =>
    typeof v === 'number' && Number.isFinite(v) ? clamp(v, lim.min, lim.max) : def;
  const color = (v: unknown, def: string) => (typeof v === 'string' && HEX.test(v) ? v : def);
  return {
    gridVisible: bool(s.gridVisible, d.gridVisible),
    gridSize: num(s.gridSize, d.gridSize, LIMITS.gridSize),
    gridDivisions: Math.round(num(s.gridDivisions, d.gridDivisions, LIMITS.gridDivisions)),
    gridColor: color(s.gridColor, d.gridColor),
    gridCenterColor: color(s.gridCenterColor, d.gridCenterColor),
    units: UNITS.includes(s.units as never) ? (s.units as Settings['units']) : d.units,
    upAxis: s.upAxis === 'y' || s.upAxis === 'z' ? s.upAxis : d.upAxis,
    backgroundColor: color(s.backgroundColor, d.backgroundColor),
    autoFitOnLoad: bool(s.autoFitOnLoad, d.autoFitOnLoad),
    snap: bool(s.snap, d.snap),
    snapMove: num(s.snapMove, d.snapMove, LIMITS.snapMove),
    snapRotate: num(s.snapRotate, d.snapRotate, LIMITS.snapRotate),
    snapScale: num(s.snapScale, d.snapScale, LIMITS.snapScale),
    snapToObjects: bool(s.snapToObjects, d.snapToObjects),
    objectSnapDistance: num(s.objectSnapDistance, d.objectSnapDistance, LIMITS.objectSnapDistance),
    measureSnapPx: num(s.measureSnapPx, d.measureSnapPx, LIMITS.measureSnapPx),
    stepQuality: s.stepQuality === 'draft' || s.stepQuality === 'fine' || s.stepQuality === 'normal' ? s.stepQuality : d.stepQuality,
    stepPerPart: bool(s.stepPerPart, d.stepPerPart),
  };
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      update: (patch) => set((state) => sanitizeSettings({ ...state, ...patch })),
      reset: () => set({ ...DEFAULT_SETTINGS }),
    }),
    {
      name: 'mesh-studio:settings',
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (state): Settings => sanitizeSettings(state),
      merge: (persisted, current) => ({ ...current, ...sanitizeSettings(persisted) }),
    },
  ),
);
