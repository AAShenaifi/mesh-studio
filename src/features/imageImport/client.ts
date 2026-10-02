import type { ImageSettings, ProcessResult, RasterRGBA } from './types';

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

function w(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./image.worker.ts', import.meta.url), { type: 'module', name: 'image-import' });
  worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; result?: unknown; error?: string }>) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    pending.delete(e.data.id);
    if (e.data.ok) p.resolve(e.data.result);
    else p.reject(new Error(e.data.error ?? 'Image processing failed'));
  };
  worker.onerror = (e) => {
    for (const p of pending.values()) p.reject(new Error(`Image worker crashed: ${e.message || 'unknown'}`));
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

function call<T>(msg: Record<string, unknown>, transfer: Transferable[] = []): Promise<T> {
  const id = ++seq;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    w().postMessage({ ...msg, id }, transfer);
  });
}

export const loadRaster = (which: 'preview' | 'full', raster: RasterRGBA) => call<void>({ type: 'load', which, raster }, [raster.rgba.buffer as ArrayBuffer]);
export const processImage = (which: 'preview' | 'full', settings: ImageSettings) => call<ProcessResult>({ type: 'process', which, settings });

/** Decodes an image (main thread, OffscreenCanvas) at most `maxSide` pixels on the long side. */
export async function decode(blob: Blob, maxSide: number): Promise<RasterRGBA> {
  const bmp = await createImageBitmap(blob);
  const srcW = bmp.width, srcH = bmp.height;
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const width = Math.max(1, Math.round(bmp.width * k)), height = Math.max(1, Math.round(bmp.height * k));
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D is not available in this browser.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, width, height);
  bmp.close();
  return { w: width, h: height, rgba: ctx.getImageData(0, 0, width, height).data, srcW, srcH };
}
