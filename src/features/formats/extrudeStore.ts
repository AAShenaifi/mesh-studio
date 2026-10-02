import { create } from 'zustand';

export interface ExtrudeSettings {
  depth: number;
  /** Target width of the result in mm (height follows the aspect ratio). */
  width: number;
  color: number;
  set: (p: Partial<Omit<ExtrudeSettings, 'set'>>) => void;
}

export const useExtrudeStore = create<ExtrudeSettings>()((set) => ({
  depth: 3,
  width: 60,
  color: 0,
  set: (p) => set(p),
}));
