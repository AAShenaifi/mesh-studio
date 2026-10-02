/// <reference lib="webworker" />
// Image import pipeline off the main thread: preview (small raster, live) and import (full raster).
import { freeScope } from '../../geometry/kernelCore';
import { contourMesh, quantize, reliefMesh, values } from './process';
import { RELIEF_FULL, RELIEF_PREVIEW, type ImageSettings, type ProcessResult, type RasterRGBA } from './types';

const rasters: { preview?: RasterRGBA; full?: RasterRGBA } = {};
let colors: string[] = [];

type Msg =
  | { id: number; type: 'load'; which: 'preview' | 'full'; raster: RasterRGBA }
  | { id: number; type: 'process'; which: 'preview' | 'full'; settings: ImageSettings };

self.onmessage = async (e: MessageEvent<Msg>) => {
  const m = e.data;
  const post = (data: object, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage({ id: m.id, ...data }, transfer);
  try {
    if (m.type === 'load') {
      rasters[m.which] = m.raster;
      if (m.which === 'preview') colors = quantize(m.raster, 8);
      post({ ok: true });
      return;
    }
    const r = rasters[m.which];
    if (!r) throw new Error('No image loaded.');
    const s = m.settings;
    const p = values(r, s);
    const mesh = s.method === 'contour' ? await contourMesh(r, s, p, colors) : reliefMesh(r, s, p, colors, m.which === 'preview' ? RELIEF_PREVIEW : RELIEF_FULL);
    const out: ProcessResult = { ...mesh, selected: p.selected };
    if (m.which === 'preview') {
      // overlay: selection (contour) or height (relief), 0..255 per pixel
      const mask = new Uint8Array(r.w * r.h);
      if (s.method === 'contour') for (let i = 0; i < mask.length; i++) mask[i] = p.values[i]! >= s.threshold ? 255 : 0;
      else {
        const white = Math.max(1, s.threshold);
        for (let i = 0; i < mask.length; i++) mask[i] = Math.min(255, Math.round((p.values[i]! / white) * 255));
      }
      Object.assign(out, { mask, maskW: r.w, maskH: r.h });
    }
    post({ ok: true, result: out }, [out.positions.buffer as ArrayBuffer, out.triColor.buffer as ArrayBuffer, ...(out.mask ? [out.mask.buffer as ArrayBuffer] : [])]);
  } catch (err) {
    post({ ok: false, error: err instanceof Error ? err.message : String(err) });
  } finally {
    freeScope();
  }
};
