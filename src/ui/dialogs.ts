import type { ComponentType } from 'react';

/** Modal dialogs contributed by feature modules (export, …). */
export const dialogs: ComponentType[] = [];
export function registerDialog(c: ComponentType) {
  dialogs.push(c);
}
