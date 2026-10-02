import { decode } from '../imageImport/client';
import { blur, inkOf, trace } from '../imageImport/process';
import type { Extrude2DArgs } from '../../geometry/kernelOps';

/** Picture → outline regions (pixel units, y down): dark/opaque parts are the shape; `invert` takes the light parts instead. */
export async function imageToRegions(blob: Blob, threshold: number, invert: boolean): Promise<{ regions: Extrude2DArgs['regions']; width: number; height: number }> {
  const r = await decode(blob, 700);
  let v = blur(inkOf(r), r.w, r.h, 1.2 * (Math.max(r.w, r.h) / 400));
  if (invert) {
    v = v.slice();
    // transparent pixels stay empty so a logo on a transparent background inverts to its own light parts
    const a = r.rgba;
    for (let i = 0; i < v.length; i++) v[i] = a[i * 4 + 3]! < 16 ? 0 : 255 - v[i]!;
  }
  const loops = trace(v, r.w, r.h, threshold, 0.35 * (Math.max(r.w, r.h) / 400));
  if (!loops.length) throw new Error('Nothing is selected in this picture. Move the threshold slider or turn on Invert.');
  return { regions: [{ contours: loops, fillRule: 'EvenOdd' }], width: r.w, height: r.h };
}
