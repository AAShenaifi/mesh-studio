import { create } from 'zustand';

export type PaintToolKind = 'brush' | 'bucket';

interface PaintState {
  color: number;
  tool: PaintToolKind;
  /** Brush radius in mm. */
  radius: number;
  /** Bucket fill stops at edges sharper than this (degrees). 180 = only colour boundaries. */
  angle: number;
  set: (p: Partial<Omit<PaintState, 'set'>>) => void;
}

export const usePaintStore = create<PaintState>()((set) => ({
  color: 3,
  tool: 'brush',
  radius: 3,
  angle: 30,
  set: (p) => set(p),
}));
