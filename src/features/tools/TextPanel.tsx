import { Vector3 } from 'three';
import type { SceneObject } from '../../scene/types';
import { useAppStore } from '../../store/useAppStore';
import { selectedObjects, useSceneStore } from '../../store/useSceneStore';
import { worldBox, worldPositions } from '../../scene/geometry';
import { createObject } from '../../scene/create';
import { soupToStl, stlToSoup } from '../../loaders/stlSoup';
import { renderScad } from '../scad/scad';
import { Button, FieldRow, NumberInput, Segmented } from '../../ui/primitives';
import { ScadError } from '../generators/generate';
import { placeOnSurface, useTextStore } from './surfaceText';
import { GROUP_LABELS, addCustomFont, allFonts, fontById, fontFiles, type FontGroup } from './fonts';
import { useEffect, useState } from 'react';

// Engrave/emboss template (OpenSCAD), applied to the selected mesh passed in as /input.stl.
const TEXT_SCAD = `
txt = "V1"; fontname = "Liberation Sans:style=Bold"; size = 6; mode = "engrave"; depth = 0.8;
pos_x = 0; pos_y = 0; rotation = 0; min_x = 0; min_y = 0; max_x = 1; max_y = 1; top_z = 1;
ar = len([for (c = txt) if (ord(c) >= 1536 && ord(c) <= 1791) 1]) > 0;
module label() translate([(min_x + max_x) / 2 + pos_x, (min_y + max_y) / 2 + pos_y]) rotate(rotation)
  text(txt, size = size, font = fontname, halign = "center", valign = "center", direction = ar ? "rtl" : "ltr", script = ar ? "arabic" : "latin");
if (mode == "engrave") difference() { import("/input.stl"); translate([0, 0, top_z - depth]) linear_extrude(depth + 1) label(); }
else union() { import("/input.stl"); translate([0, 0, top_z - 0.01]) linear_extrude(depth + 0.01) label(); }
`;

export async function addText(opts: { text: string; font: string; size: number; mode: 'engrave' | 'emboss'; depth: number; dx: number; dy: number; rotation: number }) {
  const s = useSceneStore.getState();
  const o = selectedObjects(s)[0];
  if (!o) return;
  const box = worldBox(o);
  const font = fontById(opts.font).name;
  const defines: Record<string, string> = {
    txt: JSON.stringify(opts.text), fontname: JSON.stringify(font), size: String(opts.size), mode: JSON.stringify(opts.mode), depth: String(opts.depth),
    pos_x: String(opts.dx), pos_y: String(opts.dy), rotation: String(opts.rotation),
    min_x: String(box.min.x), min_y: String(box.min.y), max_x: String(box.max.x), max_y: String(box.max.y), top_z: String(box.max.z),
  };
  const res = await useAppStore.getState().run(opts.mode === 'engrave' ? 'Engraving text' : 'Embossing text', async () => {
    const r = await renderScad(TEXT_SCAD, defines, [{ path: 'input.stl', data: soupToStl(worldPositions(o)) }, ...(await fontFiles(opts.font))]);
    if (!r.ok || !r.stl) throw new ScadError(r.log);
    return r;
  });
  if (!res?.stl) return;
  const { positions, faceColors } = stlToSoup(res.stl);
  const out = createObject(o.name, positions, faceColors, { kind: 'tool' }, 'keep');
  s.replaceObjects(`${opts.mode === 'engrave' ? 'Engrave' : 'Emboss'} “${opts.text}”`, [o.id], [{ ...out, id: o.id }]);
  useAppStore.getState().setReady(`Text added in ${(res.ms / 1000).toFixed(1)} s`);
}

/** SVG / picture on the flat top face: same projection as the surface tool, anchored at the top-face centre plus the offset. */
async function applyShapeOnTop(o: SceneObject) {
  const t = useTextStore.getState();
  const box = worldBox(o);
  const point = new Vector3((box.min.x + box.max.x) / 2 + t.dx, (box.min.y + box.max.y) / 2 + t.dy, box.max.z);
  await placeOnSurface(o, point, new Vector3(0, 0, 1));
}

/** STL Studio "Add Text" port (flat, top face) plus text/SVG projected onto any surface by clicking. */
export function TextPanel() {
  const target = useSceneStore((s) => (s.selectedIds.length === 1 ? selectedObjects(s)[0] : undefined));
  const hasObjects = useSceneStore((s) => s.objects.length > 0);
  const palette = useSceneStore((s) => s.palette);
  const busy = useAppStore((s) => s.busy);
  const placing = useAppStore((s) => s.activeTool === 'surfacetext');
  const setActiveTool = useAppStore((s) => s.setActiveTool);
  const t = useTextStore();
  const surface = t.placement === 'surface';
  const [fontErr, setFontErr] = useState('');
  useEffect(() => {
    useTextStore.getState().set({ previewOn: true });
    return () => {
      useTextStore.getState().set({ previewOn: false, hover: null });
      if (useAppStore.getState().activeTool === 'surfacetext') useAppStore.getState().setActiveTool(null);
    };
  }, []);
  const anchorObj = useSceneStore((s) => (t.anchor ? s.objects.find((o) => o.id === t.anchor!.objectId) : undefined));
  if (!surface && !target)
    return (
      <div className="flex flex-col gap-1">
        <FieldRow label="Placement">
          <Segmented label="Text placement" value={t.placement} onChange={(placement) => t.set({ placement })} options={[{ value: 'top', label: 'Top face' }, { value: 'surface', label: 'On surface' }]} />
        </FieldRow>
        <p className="m-0 text-[12.5px] text-muted">Select one object to engrave or emboss text on its top surface, or choose “On surface” to click anywhere on a model (curved faces too).</p>
      </div>
    );
  const pickFont = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.ttf,.otf,font/ttf,font/otf';
    input.addEventListener('change', async () => {
      const f = input.files?.[0];
      if (!f) return;
      const def = addCustomFont(f.name, await f.arrayBuffer());
      if (!def) return setFontErr('That file is not a usable TrueType/OpenType font.');
      setFontErr('');
      t.set({ font: def.id });
    });
    input.click();
  };
  const pickPicture = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/gif,image/bmp';
    input.addEventListener('change', () => {
      const f = input.files?.[0];
      if (f) t.set({ image: { name: f.name, blob: f } });
    });
    input.click();
  };
  const pickSvg = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.svg,image/svg+xml';
    input.addEventListener('change', async () => {
      const f = input.files?.[0];
      if (f) t.set({ svg: { name: f.name, text: await f.text() } });
    });
    input.click();
  };
  return (
    <div className="flex flex-col gap-1" data-testid="text-panel">
      <FieldRow label="Placement">
        <Segmented label="Text placement" value={t.placement} onChange={(placement) => t.set({ placement })} options={[{ value: 'top', label: 'Top face' }, { value: 'surface', label: 'On surface' }]} />
      </FieldRow>
      <FieldRow label="Shape">
        <Segmented label="Shape" value={t.source} onChange={(source) => t.set({ source })} options={[{ value: 'text', label: 'Text' }, { value: 'svg', label: 'SVG' }, { value: 'image', label: 'Picture' }]} />
      </FieldRow>
      {t.source !== 'text' ? (
        <>
          {t.source === 'svg' ? (
            <Button onClick={pickSvg}>{t.svg ? `SVG: ${t.svg.name}` : 'Choose an SVG file…'}</Button>
          ) : (
            <>
              <Button onClick={pickPicture}>{t.image ? `Picture: ${t.image.name}` : 'Choose a logo picture (PNG / JPG)…'}</Button>
              <FieldRow label="Threshold" hint="Pixels darker than this become the shape. Move it until the preview looks right.">
                <input type="range" aria-label="Picture threshold" data-testid="img-threshold" min={1} max={254} value={t.imgThreshold} onChange={(e) => t.set({ imgThreshold: +e.target.value })} className="w-full" />
              </FieldRow>
              <FieldRow label="Use light parts"><Segmented label="Picture invert" value={t.imgInvert ? 'light' : 'dark'} onChange={(v) => t.set({ imgInvert: v === 'light' })} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]} /></FieldRow>
            </>
          )}
          <FieldRow label="Width" htmlFor="tx-svgw"><NumberInput id="tx-svgw" value={t.svgWidth} min={1} max={1000} suffix="mm" onCommit={(svgWidth) => t.set({ svgWidth })} /></FieldRow>
          <input type="range" aria-label="Scale SVG" min={2} max={200} step={1} value={Math.min(200, t.svgWidth)} onChange={(e) => t.set({ svgWidth: +e.target.value })} className="w-full" />
        </>
      ) : (
        <>
          <input aria-label="Text" dir="auto" value={t.text} onChange={(e) => t.set({ text: e.target.value })} className="w-full rounded-[7px] border border-line bg-surface-2 px-2 py-1 text-[13px] outline-none focus:border-accent-hi" />
          <FieldRow label="Font" htmlFor="tx-font">
            <select id="tx-font" value={t.font} onChange={(e) => t.set({ font: e.target.value })} className="min-w-0 rounded-[7px] border border-line bg-surface-2 px-2 py-1 text-[13px]">
              {(['builtin', 'arabic', 'sans', 'serif', 'tech', 'script', 'custom'] as FontGroup[]).map((g) => {
                const list = allFonts().filter((f) => f.group === g);
                return list.length ? <optgroup key={g} label={GROUP_LABELS[g]}>{list.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</optgroup> : null;
              })}
            </select>
          </FieldRow>
          <Button onClick={pickFont}>Use my own font file (.ttf / .otf)…</Button>
          {fontErr && <p className="m-0 text-[12px] text-err">{fontErr}</p>}
          <FieldRow label="Text height" htmlFor="tx-size"><NumberInput id="tx-size" value={t.size} min={0.5} max={500} suffix="mm" onCommit={(size) => t.set({ size })} /></FieldRow>
          <input type="range" aria-label="Scale text" data-testid="text-scale" min={1} max={100} step={0.5} value={Math.min(100, t.size)} onChange={(e) => t.set({ size: +e.target.value })} className="w-full accent-[var(--color-accent-hi,#a78bfa)]" />
        </>
      )}
      {surface && (
        <FieldRow label="Follow surface" hint={t.wrap === 'wrap' ? 'Bends around curves and rounded corners like a sticker' : 'Straight projection from the click direction (curved parts stretch)'}>
          <Segmented label="Follow surface" value={t.wrap} onChange={(wrap) => t.set({ wrap })} options={[{ value: 'wrap', label: 'Wrap' }, { value: 'project', label: 'Project' }]} />
        </FieldRow>
      )}
      <FieldRow label="Mode"><Segmented label="Text mode" value={t.mode} onChange={(mode) => t.set({ mode })} options={[{ value: 'engrave', label: 'Engrave' }, { value: 'emboss', label: 'Emboss' }]} /></FieldRow>
      <FieldRow label="Depth / height" htmlFor="tx-depth"><NumberInput id="tx-depth" value={t.depth} min={0.1} max={50} suffix="mm" onCommit={(depth) => t.set({ depth })} /></FieldRow>
      {!surface && (
        <FieldRow label="X / Y offset" htmlFor="tx-dx">
          <NumberInput id="tx-dx" value={t.dx} min={-1e4} max={1e4} onCommit={(dx) => t.set({ dx })} />
          <NumberInput id="tx-dy" value={t.dy} min={-1e4} max={1e4} onCommit={(dy) => t.set({ dy })} />
        </FieldRow>
      )}
      <FieldRow label="Rotation" htmlFor="tx-rot"><NumberInput id="tx-rot" value={t.rotation} min={-360} max={360} suffix="°" onCommit={(rotation) => t.set({ rotation })} /></FieldRow>
      {surface && (
        <FieldRow label="Colour" htmlFor="tx-color" hint="Text colour (a separate filament when printing)">
          <select id="tx-color" value={t.color} onChange={(e) => t.set({ color: +e.target.value })} className="rounded-[7px] border border-line bg-surface-2 px-2 py-1 text-[13px]">
            <option value={-1}>Object colour</option>
            {palette.map((c, i) => <option key={i} value={i}>{`Colour ${i + 1} ${c}`}</option>)}
          </select>
        </FieldRow>
      )}
      <Button
        variant={placing ? 'primary' : 'default'}
        className="mt-1 w-full"
        data-testid="text-move"
        disabled={!!busy || (!surface && !target) || (surface && !hasObjects)}
        onClick={() => setActiveTool(placing ? null : 'surfacetext')}
      >
        {placing ? 'Move the cursor over the model, click to fix it (Esc)' : surface ? (t.anchor ? 'Move to another spot…' : 'Pick the spot on the model…') : 'Move text with the cursor…'}
      </Button>
      {surface ? (
        <Button
          variant="primary"
          className="w-full"
          data-testid="text-apply"
          disabled={!!busy || !anchorObj || (t.source === 'text' ? !t.text.trim() : t.source === 'svg' ? !t.svg : !t.image)}
          onClick={() => anchorObj && t.anchor && void placeOnSurface(anchorObj, new Vector3(...t.anchor.point), new Vector3(...t.anchor.normal))}
        >
          {t.mode === 'engrave' ? 'Engrave' : 'Emboss'} {t.source === 'svg' ? 'SVG' : t.source === 'image' ? 'picture' : 'text'} here
        </Button>
      ) : (
        <Button variant="primary" className="w-full" data-testid="text-apply" disabled={!!busy || !target || (t.source === 'text' ? !t.text.trim() : t.source === 'svg' ? !t.svg : !t.image)} onClick={() => t.source !== 'text' ? void applyShapeOnTop(target!) : void addText({ text: t.text, font: t.font, size: t.size, mode: t.mode, depth: t.depth, dx: t.dx, dy: t.dy, rotation: t.rotation })}>
          {t.mode === 'engrave' ? 'Engrave' : 'Emboss'} {t.source === 'svg' ? 'SVG' : t.source === 'image' ? 'picture' : 'text'}
        </Button>
      )}
      <p className="m-0 text-[12px] text-muted">The coloured preview in the viewport shows exactly where and how big the text will be ({t.mode === 'engrave' ? 'red = cut away' : 'green = added'}).</p>
    </div>
  );
}
