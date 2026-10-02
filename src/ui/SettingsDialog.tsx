import { useId, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useAppStore } from '../store/useAppStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { LIMITS } from '../settings/defaults';
import { mmToUnit, unitToMm, type Unit } from '../settings/units';
import type { UpAxis } from '../settings/axes';
import { CloseIcon } from './icons';
import { Button, ColorInput, FieldRow, NumberInput, Segmented, SwitchInput } from './primitives';

function Group({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className="border-b border-line py-3 first:pt-0 last:border-b-0 last:pb-0">
      <h3 id={id} className="m-0 mb-1 text-xs font-bold uppercase tracking-[0.8px] text-accent-soft">
        {title}
      </h3>
      {children}
    </div>
  );
}

export function SettingsDialog() {
  const open = useAppStore((s) => s.dialog === 'settings');
  const setDialog = useAppStore((s) => s.setDialog);
  const setOpen = (o: boolean) => setDialog(o ? 'settings' : null);
  const s = useSettingsStore();
  const { update, units } = s;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px]" />
        <Dialog.Content
          onEscapeKeyDown={(e) => {
            // Escape in an edited field reverts the field; a second Escape closes.
            const active = document.activeElement;
            if (active instanceof HTMLElement && active.dataset.dirty === 'true') e.preventDefault();
          }}
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[min(720px,calc(100vh-32px))] w-[min(460px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-line-strong bg-surface shadow-2xl outline-none"
        >
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <Dialog.Title className="m-0 text-base font-extrabold">Settings</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" aria-label="Close settings" className="rounded-md p-1 text-muted hover:bg-surface-3 hover:text-ink">
                <CloseIcon />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">Workspace, grid and viewport preferences. Saved on this device.</Dialog.Description>

          <div className="overflow-y-auto px-5 py-4">
            <Group title="Workspace">
              <FieldRow label="Units" hint="Display only. Model data stays in millimetres.">
                <Segmented<Unit>
                  label="Units"
                  value={units}
                  onChange={(v) => update({ units: v })}
                  options={[
                    { value: 'mm', label: 'mm' },
                    { value: 'cm', label: 'cm' },
                    { value: 'in', label: 'in' },
                  ]}
                />
              </FieldRow>
              <FieldRow label="Up axis" hint="Axis STL/OBJ files are authored in, and the export default. The workspace itself is always Z-up; glTF is converted from Y-up.">
                <Segmented<UpAxis>
                  label="Up axis"
                  value={s.upAxis}
                  onChange={(v) => update({ upAxis: v })}
                  options={[
                    { value: 'z', label: 'Z-up' },
                    { value: 'y', label: 'Y-up' },
                  ]}
                />
              </FieldRow>
              <FieldRow label="Snap gizmo to steps" htmlFor="set-snap" hint="Also toggled with the S key.">
                <SwitchInput id="set-snap" checked={s.snap} onChange={(v) => update({ snap: v })} />
              </FieldRow>
              <FieldRow label="Move / rotate / scale step" htmlFor="set-snap-move">
                <NumberInput id="set-snap-move" value={s.snapMove} min={0.01} max={1000} suffix="mm" onCommit={(v) => update({ snapMove: v })} compact />
                <NumberInput id="set-snap-rot" value={s.snapRotate} min={0.1} max={180} suffix="°" onCommit={(v) => update({ snapRotate: v })} compact />
                <NumberInput id="set-snap-scale" value={s.snapScale} min={0.1} max={100} suffix="%" onCommit={(v) => update({ snapScale: v })} compact />
              </FieldRow>
              <FieldRow label="Snap to other objects" htmlFor="set-objsnap" hint="While moving: sides, centres and tops line up with nearby objects.">
                <SwitchInput id="set-objsnap" checked={s.snapToObjects} onChange={(v) => update({ snapToObjects: v })} />
              </FieldRow>
              <FieldRow label="Object snap distance" htmlFor="set-objsnap-d">
                <NumberInput id="set-objsnap-d" value={s.objectSnapDistance} min={0.01} max={100} suffix="mm" onCommit={(v) => update({ objectSnapDistance: v })} />
              </FieldRow>
              <FieldRow label="Measure snap radius" htmlFor="set-msnap" hint="How close (screen pixels) the cursor must be to an edge, corner or hole.">
                <NumberInput id="set-msnap" value={s.measureSnapPx} min={1} max={50} suffix="px" onCommit={(v) => update({ measureSnapPx: v })} />
              </FieldRow>
              <FieldRow label="Fit camera on load" htmlFor="set-autofit">
                <SwitchInput id="set-autofit" checked={s.autoFitOnLoad} onChange={(v) => update({ autoFitOnLoad: v })} />
              </FieldRow>
            </Group>

            <Group title="Grid">
              <FieldRow label="Show grid" htmlFor="set-grid">
                <SwitchInput id="set-grid" checked={s.gridVisible} onChange={(v) => update({ gridVisible: v })} />
              </FieldRow>
              <FieldRow label="Size" htmlFor="set-grid-size" hint="Edge length of the square grid.">
                <NumberInput
                  id="set-grid-size"
                  value={mmToUnit(s.gridSize, units)}
                  min={mmToUnit(LIMITS.gridSize.min, units)}
                  max={mmToUnit(LIMITS.gridSize.max, units)}
                  suffix={units}
                  onCommit={(v) => update({ gridSize: unitToMm(v, units) })}
                />
              </FieldRow>
              <FieldRow
                label="Divisions"
                htmlFor="set-grid-div"
                hint={`Cell size ${Number(mmToUnit(s.gridSize / s.gridDivisions, units).toFixed(3))} ${units}`}
              >
                <NumberInput
                  id="set-grid-div"
                  integer
                  value={s.gridDivisions}
                  min={LIMITS.gridDivisions.min}
                  max={LIMITS.gridDivisions.max}
                  onCommit={(v) => update({ gridDivisions: v })}
                />
              </FieldRow>
              <FieldRow label="Line color" htmlFor="set-grid-color">
                <ColorInput id="set-grid-color" value={s.gridColor} onChange={(v) => update({ gridColor: v })} />
              </FieldRow>
              <FieldRow label="Center line color" htmlFor="set-grid-center">
                <ColorInput id="set-grid-center" value={s.gridCenterColor} onChange={(v) => update({ gridCenterColor: v })} />
              </FieldRow>
            </Group>

            <Group title="CAD import (STEP / IGES)">
              <FieldRow label="Tessellation quality" htmlFor="set-stepq" hint="How finely curved surfaces become triangles">
                <select id="set-stepq" value={s.stepQuality} onChange={(e) => update({ stepQuality: e.target.value as 'draft' | 'normal' | 'fine' })} className="rounded-[7px] border border-line bg-surface-2 px-2 py-1 text-[13px]">
                  <option value="draft">Draft</option>
                  <option value="normal">Normal</option>
                  <option value="fine">Fine</option>
                </select>
              </FieldRow>
              <FieldRow label="One object per part" htmlFor="set-stepparts" hint="Off: merge an assembly into one object">
                <SwitchInput id="set-stepparts" checked={s.stepPerPart} onChange={(v) => update({ stepPerPart: v })} />
              </FieldRow>
            </Group>

            <Group title="Viewport">
              <FieldRow label="Background" htmlFor="set-bg">
                <ColorInput id="set-bg" value={s.backgroundColor} onChange={(v) => update({ backgroundColor: v })} />
              </FieldRow>
            </Group>

            <Group title="About and licences">
              <p className="m-0 text-xs leading-relaxed text-muted" data-testid="licence-note">
                Mesh Studio contains code translated from Bambu Studio (simplify, auto orient, cut connectors and dovetail, painted 3MF, feature
                measure), licensed AGPL-3.0; the list is in PORTED.md. Under AGPL-3.0 everyone who uses this app over the network may get its
                source code:{' '}
                <a className="text-accent-hi underline" href="https://github.com/AAShenaifi/mesh-studio" target="_blank" rel="noreferrer">
                  source code
                </a>
                . Engines: manifold-3d (Apache-2.0), OpenCascade via occt-import-js (LGPL-2.1), three.js (MIT), OpenSCAD (GPL-2).
              </p>
            </Group>
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-line px-5 py-3">
            <Button variant="ghost" onClick={s.reset}>
              Reset to defaults
            </Button>
            <Dialog.Close asChild>
              <Button variant="primary">Done</Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
