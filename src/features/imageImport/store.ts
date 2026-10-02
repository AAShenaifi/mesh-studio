import { create } from 'zustand';
import { DEFAULT_IMAGE_SETTINGS, type ImageSettings } from './types';

interface ImageImportState {
  open: boolean;
  blob: Blob | null;
  name: string;
  /** Object being re-tuned (null = new import). */
  editId: string | null;
  /** Last used settings; new imports start from these. */
  settings: ImageSettings;
  openFor: (blob: Blob, name: string, editId?: string, settings?: ImageSettings) => void;
  close: () => void;
  set: (p: Partial<ImageSettings>) => void;
}

export const useImageImportStore = create<ImageImportState>()((set, get) => ({
  open: false,
  blob: null,
  name: '',
  editId: null,
  settings: { ...DEFAULT_IMAGE_SETTINGS },
  openFor: (blob, name, editId, settings) => set({ open: true, blob, name, editId: editId ?? null, settings: { ...(settings ?? get().settings) } }),
  close: () => set({ open: false, blob: null, editId: null }),
  set: (p) => set((s) => ({ settings: { ...s.settings, ...p } })),
}));
