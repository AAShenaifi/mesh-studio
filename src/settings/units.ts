// Model data is always stored in millimetres. Units only affect what the UI
// shows and what numbers the user types in.

export type Unit = 'mm' | 'cm' | 'in';

export const UNITS: readonly Unit[] = ['mm', 'cm', 'in'];

const MM_PER_UNIT: Record<Unit, number> = { mm: 1, cm: 10, in: 25.4 };

/** Decimal places that read naturally for each unit. */
const DECIMALS: Record<Unit, number> = { mm: 2, cm: 3, in: 3 };

export function mmToUnit(mm: number, unit: Unit): number {
  return mm / MM_PER_UNIT[unit];
}

export function unitToMm(value: number, unit: Unit): number {
  return value * MM_PER_UNIT[unit];
}

/** Formats a millimetre length in the chosen unit, trimming trailing zeros. */
export function formatLength(mm: number, unit: Unit, withUnit = true): string {
  const v = mmToUnit(mm, unit);
  const text = Number(v.toFixed(DECIMALS[unit])).toString();
  return withUnit ? `${text} ${unit}` : text;
}
