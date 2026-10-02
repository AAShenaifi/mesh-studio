import type { ComponentType } from 'react';

/** In-canvas components contributed by tools (cut plane, paint cursor…). Registered at module load. */
export const viewportOverlays: ComponentType[] = [];
export function registerOverlay(c: ComponentType) {
  viewportOverlays.push(c);
}
