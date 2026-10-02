import { Color, LinearSRGBColorSpace } from 'three';

/** Palette index 0 is the default colour of unpainted faces. */
export const DEFAULT_PALETTE = [
  '#b58fd0', '#f1e9f5', '#2a2a2e', '#ef6b73', '#58c48e', '#7fb4ff', '#f0b64e', '#ff9348',
];

export const MAX_PALETTE = 64;

/** sRGB bytes of a #rrggbb colour (what files and colour pickers use). */
export function hexToRgb255(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const v = m ? parseInt(m[1]!, 16) : 0xb58fd0;
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** Linear-light bytes for GPU vertex colours (three.js treats vertex colours as linear). */
export function hexToLinear255(hex: string): [number, number, number] {
  const c = new Color().setStyle(hex);
  return [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)];
}

/** Hex for linear-light 0..1 components (vertex colours read from files). */
export function linearToHex(r: number, g: number, b: number): string {
  return `#${new Color().setRGB(r, g, b, LinearSRGBColorSpace).getHexString()}`;
}

export function rgbToHex(r: number, g: number, b: number): string {
  const h = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/**
 * Returns the palette index for `hex`, appending it if new. Near-identical
 * colours (distance < 6 per channel) reuse the existing slot.
 */
export function paletteIndexFor(palette: string[], hex: string): number {
  const [r, g, b] = hexToRgb255(hex);
  for (let i = 0; i < palette.length; i++) {
    const [pr, pg, pb] = hexToRgb255(palette[i]!);
    if (Math.abs(pr - r) < 6 && Math.abs(pg - g) < 6 && Math.abs(pb - b) < 6) return i;
  }
  if (palette.length >= MAX_PALETTE) return 0;
  palette.push(rgbToHex(r, g, b));
  return palette.length - 1;
}
