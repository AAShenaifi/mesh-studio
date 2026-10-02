import type { ComponentType } from 'react';
import type { SidebarTab } from '../store/useAppStore';

export interface PanelDef {
  tab: SidebarTab;
  title: string;
  order: number;
  Component: ComponentType;
  /** Collapsed by default. */
  collapsed?: boolean;
}

/** Sidebar sections contributed by feature modules (each phase adds its own). */
export const panels: PanelDef[] = [];
export function registerPanel(def: PanelDef) {
  panels.push(def);
  panels.sort((a, b) => a.order - b.order);
}
