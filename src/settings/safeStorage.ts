import type { StateStorage } from 'zustand/middleware';

// localStorage can be missing or throw (private mode, blocked site data, quota).
// Fall back to an in-memory map so the app keeps working, just without
// persistence for that session.
const memory = new Map<string, string>();

export const safeStorage: StateStorage = {
  getItem(name) {
    try {
      return window.localStorage.getItem(name) ?? memory.get(name) ?? null;
    } catch {
      return memory.get(name) ?? null;
    }
  },
  setItem(name, value) {
    memory.set(name, value);
    try {
      window.localStorage.setItem(name, value);
    } catch {
      /* storage unavailable or full: in-memory copy is kept */
    }
  },
  removeItem(name) {
    memory.delete(name);
    try {
      window.localStorage.removeItem(name);
    } catch {
      /* ignore */
    }
  },
};
