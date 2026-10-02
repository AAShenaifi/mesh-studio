import { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useSceneStore } from '../../store/useSceneStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { formatLength, mmToUnit, unitToMm } from '../../settings/units';
import { CloseIcon } from '../../ui/icons';
import { Button, FieldRow, NumberInput, Segmented, SwitchInput } from '../../ui/primitives';
import { decode, loadRaster, processImage } from './client';
import { importImage } from './importImage';
import { PreviewCanvas } from './PreviewCanvas';
import { useImageImportStore } from './store';
import { PREVIEW_MAX, type ImageMethod, type ProcessResult, type RasterRGBA } from './types';

/** Draws the image with the selected pixels (contour) or heights (relief) highlighted. */
function drawOverlay(canvas: HTMLCanvasElement, img: RasterRGBA, res: ProcessResult | null, method: ImageMethod) {
  canvas.width = img.w;
  canvas.height = img.h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  const out = new ImageData(new Uint8ClampedArray(img.rgba), img.w, img.h);
  const d = out.data;
  const mask = res?.mask;
  if (mask && mask.length === img.w * img.h) {
    for (let i = 0; i < mask.length; i++) {
      const a = d[i * 4 + 3]! / 255;
      // dim the photo, then paint the selection / height in the accent colour
      let r = d[i * 4]! * a + 255 * (1 - a), g = d[i * 4 + 1]! * a + 255 * (1 - a), b = d[i * 4 + 2]! * a + 255 * (1 - a);
      r = r * 0.45 + 20; g = g * 0.45 + 16; b = b * 0.45 + 26;
      const k = method === 'contour' ? (mask[i]! ? 0.75 : 0) : (mask[i]! / 255) * 0.85;
      d[i * 4] = r * (1 - k) + 255 * k;
      d[i * 4 + 1] = g * (1 - k) + 209 * k;
      d[i * 4 + 2] = b * (1 - k) + 102 * k;
      d[i * 4 + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
}

export function ImageImportDialog() {
  const { open, blob, name, editId, settings: s, set, close } = useImageImportStore();
  const unit = useSettingsStore((x) => x.units);
  const palette = useSceneStore((x) => x.palette);
  const [img, setImg] = useState<RasterRGBA | null>(null);
  const [res, setRes] = useState<ProcessResult | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const token = useRef(0);

  // decode once per opened image (preview size); the worker keeps its own copy
  useEffect(() => {
    if (!open || !blob) return;
    let alive = true;
    setImg(null);
    setRes(null);
    setError(null);
    decode(blob, PREVIEW_MAX)
      .then(async (r) => {
        const copy = { ...r, rgba: new Uint8ClampedArray(r.rgba) };
        await loadRaster('preview', r);
        if (alive) setImg(copy);
      })
      .catch((e) => alive && setError(`Could not read ${name}: ${e instanceof Error ? e.message : String(e)}`));
    return () => {
      alive = false;
    };
  }, [open, blob, name]);

  // live preview: debounced, latest request wins
  useEffect(() => {
    if (!img) return;
    const my = ++token.current;
    setWorking(true);
    const t = window.setTimeout(() => {
      processImage('preview', s)
        .then((r) => {
          if (my !== token.current) return;
          setRes(r);
          setError(null);
        })
        .catch((e) => my === token.current && setError(e instanceof Error ? e.message : String(e)))
        .finally(() => my === token.current && setWorking(false));
    }, 120);
    return () => window.clearTimeout(t);
  }, [img, s]);

  useEffect(() => {
    if (canvas.current && img) drawOverlay(canvas.current, img, res, s.method);
  }, [img, res, s.method]);

  const doImport = async () => {
    if (!blob) return;
    const obj = await importImage(blob, name, s, editId);
    if (obj) close();
  };

  const contour = s.method === 'contour';
  const size = res?.size;
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh-24px)] w-[min(1060px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-line-strong bg-surface shadow-2xl outline-none"
          onEscapeKeyDown={(e) => {
            const a = document.activeElement;
            if (a instanceof HTMLElement && a.dataset.dirty === 'true') e.preventDefault();
          }}
        >
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <Dialog.Title className="m-0 truncate text-base font-extrabold">{editId ? 'Re-tune image' : 'Import image'} · {name}</Dialog.Title>
            <Dialog.Close aria-label="Close image import" className="rounded-md p-1 text-muted hover:bg-surface-3 hover:text-ink">
              <CloseIcon />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">Choose how the image becomes a 3D object. The highlighted pixels are what will be raised.</Dialog.Description>
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_340px] gap-4 overflow-y-auto p-4 max-md:grid-cols-1">
            <div className="flex min-h-[280px] flex-col gap-2">
              <div className="grid flex-1 place-items-center rounded-[10px] border border-line bg-[repeating-conic-gradient(#221a2c_0_25%,#1a1422_0_50%)] bg-[length:16px_16px] p-2">
                {img ? (
                  <canvas
                    ref={canvas}
                    data-testid="image-overlay"
                    data-selected={res?.selected ?? ''}
                    data-points={res?.points ?? ''}
                    aria-label={contour ? 'Image with the selected pixels highlighted' : 'Image with relief heights highlighted'}
                    className="h-auto"
                    style={{
                      aspectRatio: `${img.w} / ${img.h}`,
                      // fill the panel, keep the aspect ratio; small images stay crisp when enlarged
                      width: `min(100%, calc(52vh * ${img.w / img.h}))`,
                      imageRendering: img.w < 300 ? 'pixelated' : 'auto',
                    }}
                  />
                ) : (
                  <p className="text-[13px] text-muted">{error ?? 'Reading image…'}</p>
                )}
              </div>
              <p className="m-0 text-xs text-muted" data-testid="image-stats" aria-live="polite">
                {res
                  ? `${contour ? `${res.selected.toLocaleString()} px selected · ${res.points.toLocaleString()} outline points` : `${res.selected.toLocaleString()} px raised`} · ${size ? `${formatLength(size[0], unit)} × ${formatLength(size[1], unit)} × ${formatLength(size[2], unit)}` : ''}${working ? ' · updating…' : ''}`
                  : working ? 'Processing…' : ''}
                {img && (img.srcW ?? img.w) > img.w && ` · preview downscaled from ${img.srcW} × ${img.srcH} px; Import uses full resolution`}
              </p>
              {error && img && <p role="alert" className="m-0 text-xs text-err">{error}</p>}
            </div>
            <div className="flex flex-col gap-1">
              <FieldRow label="Method">
                <Segmented<ImageMethod> label="Method" value={s.method} onChange={(m) => set({ method: m })} options={[{ value: 'contour', label: 'Contour' }, { value: 'relief', label: 'Relief' }]} />
              </FieldRow>
              <label className="mt-1 text-xs font-semibold text-muted" htmlFor="ii-levels">
                Levels {contour ? '(which pixels are selected)' : '(ink that reaches full height)'}: {s.threshold}
              </label>
              <input id="ii-levels" aria-label="Levels" type="range" min={1} max={255} value={s.threshold} onChange={(e) => set({ threshold: +e.target.value })} className="w-full accent-accent-hi" />
              <label className="mt-1 text-xs font-semibold text-muted" htmlFor="ii-smooth">Smooth: {s.smooth}</label>
              <input id="ii-smooth" aria-label="Smooth" type="range" min={0} max={10} step={0.5} value={s.smooth} onChange={(e) => set({ smooth: +e.target.value })} className="w-full accent-accent-hi" />
              <FieldRow label="Invert" htmlFor="ii-invert" hint={contour ? 'Select the other pixels' : 'Light areas become high'}>
                <SwitchInput id="ii-invert" checked={s.invert} onChange={(v) => set({ invert: v })} />
              </FieldRow>
              <FieldRow label="Width" htmlFor="ii-width" hint="Height follows the image">
                <NumberInput id="ii-width" value={mmToUnit(s.width, unit)} min={mmToUnit(1, unit)} max={mmToUnit(5000, unit)} suffix={unit} onCommit={(v) => set({ width: unitToMm(v, unit) })} />
              </FieldRow>
              <FieldRow label={contour ? 'Depth' : 'Relief height'} htmlFor="ii-depth">
                <NumberInput id="ii-depth" value={mmToUnit(s.depth, unit)} min={mmToUnit(0.05, unit)} max={mmToUnit(500, unit)} suffix={unit} onCommit={(v) => set({ depth: unitToMm(v, unit) })} />
              </FieldRow>
              {!contour && (
                <FieldRow label="Base thickness" htmlFor="ii-base">
                  <NumberInput id="ii-base" value={mmToUnit(s.base, unit)} min={mmToUnit(0.1, unit)} max={mmToUnit(100, unit)} suffix={unit} onCommit={(v) => set({ base: unitToMm(v, unit) })} />
                </FieldRow>
              )}
              <FieldRow label="Colour">
                <div className="flex flex-wrap gap-1">
                  {palette.slice(0, 8).map((c, i) => (
                    <button key={c + i} type="button" aria-label={`Image colour ${c}`} aria-pressed={s.color === i} onClick={() => set({ color: i })} className={`h-5 w-5 rounded border ${s.color === i ? 'border-ink ring-2 ring-accent-hi' : 'border-line-strong'}`} style={{ background: c }} />
                  ))}
                </div>
              </FieldRow>
              <FieldRow label="Textures" htmlFor="ii-tex" hint="Keep image colours on the top face (up to 8 colours)">
                <SwitchInput id="ii-tex" checked={s.textures} onChange={(v) => set({ textures: v })} />
              </FieldRow>
              <div className="mt-2 h-56 overflow-hidden rounded-[10px] border border-line">
                <PreviewCanvas positions={res?.positions ?? null} triColor={res?.triColor ?? null} colors={res?.colors ?? []} base={palette[s.color] ?? palette[0]!} />
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
            <Dialog.Close asChild>
              <Button variant="ghost">Cancel</Button>
            </Dialog.Close>
            <Button variant="primary" disabled={!res || !res.positions.length} onClick={() => void doImport()}>
              {editId ? 'Apply' : 'Import'}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
