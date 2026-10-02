import { useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useSceneStore } from '../../store/useSceneStore';
import { viewportHandlers } from '../../viewport/SceneObjects';
import { originalTriangle } from '../paint/meshQuery';
import { Button, FieldRow, NumberInput, SwitchInput } from '../../ui/primitives';
import { autoOrientForPrinting } from '../meshTools/ops';
import { autoOrientSelected, faceDown, worldFaceNormal } from './orient';

/** Viewport handler: while active, clicking a face lays that face on the grid. */
export function LayFlatTool() {
  const active = useAppStore((s) => s.activeTool === 'layflat');
  useEffect(() => {
    if (!active) return;
    viewportHandlers.click = (e, o) => {
      if (e.faceIndex == null) return true;
      const n = worldFaceNormal(o, originalTriangle(o.geometry, e.faceIndex));
      const s = useSceneStore.getState();
      s.apply('Lay flat on face', { objects: s.objects.map((x) => (x.id === o.id ? faceDown(x, n) : x)), selectedIds: [o.id] });
      useAppStore.getState().setActiveTool(null);
      useAppStore.getState().setReady('Face placed on the grid');
      return true;
    };
    return () => {
      viewportHandlers.click = null;
    };
  }, [active]);
  return null;
}

export function OrientPanel() {
  const active = useAppStore((s) => s.activeTool === 'layflat');
  const setActiveTool = useAppStore((s) => s.setActiveTool);
  const hasObjects = useSceneStore((s) => s.objects.length > 0);
  const hasSel = useSceneStore((s) => s.selectedIds.length > 0);
  const overhang = useAppStore((s) => s.overhang);
  const setOverhang = useAppStore((s) => s.setOverhang);
  const busy = useAppStore((s) => !!s.busy);
  return (
    <div className="flex flex-col gap-1.5">
      <Button variant={active ? 'primary' : 'default'} disabled={!hasObjects} onClick={() => setActiveTool(active ? null : 'layflat')}>
        {active ? 'Click a face to put it down… (Esc)' : 'Lay flat: pick a face'}
      </Button>
      <Button variant="primary" disabled={!hasSel || busy} onClick={() => void autoOrientForPrinting()}>Auto orient for printing (fewest overhangs)</Button>
      <Button disabled={!hasSel} onClick={autoOrientSelected}>Largest flat face down</Button>
      <FieldRow label="Show overhangs" htmlFor="oh-show" hint="Red faces would need support">
        <SwitchInput id="oh-show" checked={overhang.show} onChange={(show) => setOverhang({ show })} />
      </FieldRow>
      <FieldRow label="Overhang threshold" htmlFor="oh-angle" hint="Angle from horizontal (Bambu default 30°)">
        <NumberInput id="oh-angle" value={overhang.angle} min={0} max={89} suffix="°" onCommit={(angle) => setOverhang({ angle })} />
      </FieldRow>
      <p className="m-0 text-xs text-muted">Scale to an exact size or fit a box in Edit → Resize. 90° steps and mirroring in Edit → Rotate / mirror.</p>
    </div>
  );
}
