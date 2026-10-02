export type ImageMethod = 'contour' | 'relief';

export interface ImageSettings {
  method: ImageMethod;
  /** 1–255. Contour: pixels at least this "inky" are selected. Relief: ink level that reaches full height. */
  threshold: number;
  /** Flips which pixels are selected (contour) / which are high (relief). */
  invert: boolean;
  /** 0–10: blur before thresholding plus stronger outline simplification. */
  smooth: number;
  /** Extrusion depth (contour) or relief height above the base (mm). */
  depth: number;
  /** Width of the result in mm; height follows the image aspect ratio. */
  width: number;
  /** Relief: thickness under the lightest pixel (mm). */
  base: number;
  /** Palette index for sides/bottom (and everything when textures are off). */
  color: number;
  /** Keep image colours on the top face (quantised to ≤ 8 colours). */
  textures: boolean;
}

export const DEFAULT_IMAGE_SETTINGS: ImageSettings = {
  method: 'contour',
  threshold: 128,
  invert: false,
  smooth: 1,
  depth: 3,
  width: 60,
  base: 0.6,
  color: 0,
  textures: false,
};

/** Long side used for the live preview; Import uses the full image up to FULL_MAX. */
export const PREVIEW_MAX = 400;
export const FULL_MAX = 2048;
/** Relief grid samples along the long side (preview / import). */
export const RELIEF_PREVIEW = 120;
export const RELIEF_FULL = 360;

export interface RasterRGBA {
  w: number;
  h: number;
  rgba: Uint8ClampedArray;
  /** Original image size before downscaling. */
  srcW?: number;
  srcH?: number;
}

export interface ProcessResult {
  /** Selection (contour) or height (relief) per preview pixel, 0..255; only for previews. */
  mask?: Uint8Array;
  maskW?: number;
  maskH?: number;
  /** Selected pixel count (contour) / non-zero height pixels (relief). */
  selected: number;
  /** Total outline points after smoothing (contour). */
  points: number;
  positions: Float32Array;
  /** Index into `colors` per triangle; 0 is the base colour. */
  triColor: Uint8Array;
  /** Quantised image colours (hex), index 1.. in triColor. */
  colors: string[];
  size: [number, number, number];
}
