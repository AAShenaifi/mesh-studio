import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { selectedObjects, useSceneStore } from '../../store/useSceneStore';
import { Button, FieldRow, NumberInput } from '../../ui/primitives';
import { align, arrange, distribute, type AlignMode } from './arrange';
import { brimEarsSelected, extrudeDownSelected, mergeSelected, simplifySelected, smoothSelected, splitIntoParts } from './ops';

const Sub = ({ children }: { children: string }) => <p className="m-0 mt-2 text-xs font-bold uppercase tracking-[0.6px] text-muted">{children}</p>;

function useOne() {
  return useSceneStore((s) => (s.selectedIds.length === 1 ? selectedObjects(s)[0] : undefined));
}

export function MeshToolsPanel() {
  const o = useOne();
  const busy = useAppStore((s) => !!s.busy);
  const [ratio, setRatio] = useState(50);
  const [subdiv, setSubdiv] = useState(2);
  const [sharp, setSharp] = useState(60);
  const [ear, setEar] = useState({ d: 10, h: 0.4, angle: 125 });
  if (!o) return <p className="m-0 text-[12.5px] text-muted">Select one object to simplify, smooth, extrude it down to the grid or add brim ears.</p>;
  const tris = o.faceColors.length;
  return (
    <div className="flex flex-col gap-1" data-testid="mesh-tools">
      <Sub>Simplify</Sub>
      <FieldRow label="Keep triangles" htmlFor="simp-ratio" hint={`≈ ${Math.max(4, Math.floor((tris * ratio) / 100)).toLocaleString()} of ${tris.toLocaleString()}`}>
        <NumberInput id="simp-ratio" value={ratio} min={1} max={99} suffix="%" onCommit={setRatio} />
      </FieldRow>
      <Button disabled={busy} onClick={() => void simplifySelected(ratio / 100)}>Simplify (keep shape)</Button>
      <Sub>Smooth</Sub>
      <FieldRow label="Subdivisions" htmlFor="smooth-n" hint="Each level splits every edge in this many parts">
        <NumberInput id="smooth-n" value={subdiv} min={1} max={6} integer onCommit={setSubdiv} />
      </FieldRow>
      <FieldRow label="Keep edges sharper than" htmlFor="smooth-sharp">
        <NumberInput id="smooth-sharp" value={sharp} min={0} max={180} suffix="°" onCommit={setSharp} />
      </FieldRow>
      <Button disabled={busy || tris > 400_000} onClick={() => void smoothSelected(subdiv, sharp)}>Smooth</Button>
      <Sub>Extrude down</Sub>
      <p className="m-0 text-xs text-muted">Fills everything under the object’s downward faces straight down to the grid (or to its lowest point).</p>
      <Button disabled={busy} onClick={() => void extrudeDownSelected()}>Extrude down to the grid</Button>
      <Sub>Brim ears</Sub>
      <FieldRow label="Ear diameter" htmlFor="ear-d">
        <NumberInput id="ear-d" value={ear.d} min={1} max={60} suffix="mm" onCommit={(d) => setEar({ ...ear, d })} />
      </FieldRow>
      <FieldRow label="Ear thickness" htmlFor="ear-h">
        <NumberInput id="ear-h" value={ear.h} min={0.1} max={5} suffix="mm" onCommit={(h) => setEar({ ...ear, h })} />
      </FieldRow>
      <FieldRow label="Corners sharper than" htmlFor="ear-angle">
        <NumberInput id="ear-angle" value={ear.angle} min={10} max={179} suffix="°" onCommit={(angle) => setEar({ ...ear, angle })} />
      </FieldRow>
      <Button disabled={busy} onClick={() => void brimEarsSelected(ear.d, ear.h, ear.angle)}>Add brim ears</Button>
    </div>
  );
}

export function PartsPanel() {
  const n = useSceneStore((s) => s.selectedIds.length);
  const busy = useAppStore((s) => !!s.busy);
  return (
    <div className="flex flex-col gap-1.5">
      <Button disabled={n !== 1 || busy} onClick={() => void splitIntoParts()}>Split into parts (one object per piece)</Button>
      <Button disabled={n < 2} onClick={mergeSelected}>Merge selected into one object</Button>
      <p className="m-0 text-xs text-muted">Merge keeps every mesh as it is (no boolean), like grouping. Use Booleans → Union to fuse overlapping solids.</p>
    </div>
  );
}

const ALIGN: Array<[AlignMode, string]> = [
  ['left', 'Left'], ['centerX', 'Centre X'], ['right', 'Right'],
  ['front', 'Front'], ['centerY', 'Centre Y'], ['back', 'Back'],
  ['bottom', 'Bottom'], ['centerZ', 'Centre Z'], ['top', 'Top'],
];

export function ArrangePanel() {
  const n = useSceneStore((s) => s.selectedIds.length);
  const count = useSceneStore((s) => s.objects.length);
  const [spacing, setSpacing] = useState(6);
  return (
    <div className="flex flex-col gap-1.5" data-testid="arrange-panel">
      <FieldRow label="Spacing" htmlFor="arr-gap">
        <NumberInput id="arr-gap" value={spacing} min={0} max={100} suffix="mm" onCommit={setSpacing} />
      </FieldRow>
      <Button disabled={!count} onClick={() => arrange(spacing)}>{n > 1 ? `Arrange ${n} selected` : 'Arrange all objects'}</Button>
      <PlaceOnButton />
      <Sub>Exploded view</Sub>
      <ExplodeSlider />
      <Sub>Align selected</Sub>
      <div className="grid grid-cols-3 gap-1">
        {ALIGN.map(([m, label]) => (
          <Button key={m} disabled={n < 2} onClick={() => align(m)} aria-label={`Align ${label}`}>
            {label}
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1">
        <Button disabled={n < 3} onClick={() => distribute('x')}>Distribute X</Button>
        <Button disabled={n < 3} onClick={() => distribute('y')}>Distribute Y</Button>
      </div>
    </div>
  );
}

/** Spreads all visible objects apart from the scene centre (display only; nothing moves). */
function ExplodeSlider() {
  const explode = useAppStore((s) => s.explode);
  const set = useAppStore((s) => s.setExplode);
  return (
    <div className="flex items-center gap-2">
      <input aria-label="Explode" id="explode" type="range" min={0} max={1} step={0.01} value={explode} onChange={(e) => set(+e.target.value)} className="flex-1 accent-accent-hi" />
      <Button disabled={!explode} onClick={() => set(0)}>Assemble</Button>
    </div>
  );
}

function PlaceOnButton() {
  const n = useSceneStore((s) => s.selectedIds.length);
  const active = useAppStore((s) => s.activeTool === 'placeon');
  const setActiveTool = useAppStore((s) => s.setActiveTool);
  return (
    <Button variant={active ? 'primary' : 'default'} disabled={n !== 1} onClick={() => setActiveTool(active ? null : 'placeon')}>
      {active ? 'Click a face of another object… (Esc)' : 'Place selected on a face of another object'}
    </Button>
  );
}
