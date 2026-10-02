import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { selectedObjects, useSceneStore } from '../../store/useSceneStore';
import { useAppStore } from '../../store/useAppStore';
import { boxOf } from '../../scene/geometry';
import { useShallow } from 'zustand/react/shallow';
import { Vector3 } from 'three';
import { Button, FieldRow, NumberInput, Segmented, SwitchInput } from '../../ui/primitives';
import { applyPattern, previewCentres, usePatternStore } from './pattern';

const AXIS = [{ value: 'x' as const, label: 'X' }, { value: 'y' as const, label: 'Y' }, { value: 'z' as const, label: 'Z' }];

export function PatternPanel() {
  const n = useSceneStore((s) => s.selectedIds.length);
  const p = usePatternStore();
  if (!n) return <p className="m-0 text-[12.5px] text-muted">Select objects to copy them in a row, a grid or a circle.</p>;
  const total = p.kind === 'linear' ? Math.max(1, p.count) * Math.max(1, p.count2) : Math.max(2, p.ccount);
  return (
    <div className="flex flex-col gap-1" data-testid="pattern-panel">
      <FieldRow label="Pattern">
        <Segmented label="Pattern type" value={p.kind} onChange={(kind) => p.set({ kind })} options={[{ value: 'linear', label: 'Linear / grid' }, { value: 'circular', label: 'Circular' }]} />
      </FieldRow>
      {p.kind === 'linear' ? (
        <>
          <FieldRow label="Spacing means">
            <Segmented label="Spacing mode" value={p.spacingMode} onChange={(spacingMode) => p.set({ spacingMode })} options={[{ value: 'gap', label: 'Gap' }, { value: 'pitch', label: 'Centre to centre' }]} />
          </FieldRow>
          <FieldRow label="Direction 1"><Segmented label="Direction 1 axis" value={p.axis} onChange={(axis) => p.set({ axis })} options={AXIS} /></FieldRow>
          <FieldRow label="Count / spacing" htmlFor="pat-count">
            <NumberInput id="pat-count" value={p.count} min={1} max={500} integer onCommit={(count) => p.set({ count })} compact />
            <NumberInput id="pat-spacing" value={p.spacing} min={-10000} max={10000} suffix="mm" onCommit={(spacing) => p.set({ spacing })} compact />
          </FieldRow>
          <FieldRow label="Direction 2 (grid)"><Segmented label="Direction 2 axis" value={p.axis2} onChange={(axis2) => p.set({ axis2 })} options={AXIS} /></FieldRow>
          <FieldRow label="Count / spacing" htmlFor="pat-count2" hint="Count 1 = a single row">
            <NumberInput id="pat-count2" value={p.count2} min={1} max={500} integer onCommit={(count2) => p.set({ count2 })} compact />
            <NumberInput id="pat-spacing2" value={p.spacing2} min={-10000} max={10000} suffix="mm" onCommit={(spacing2) => p.set({ spacing2 })} compact />
          </FieldRow>
        </>
      ) : (
        <>
          <FieldRow label="Count (total)" htmlFor="pat-ccount"><NumberInput id="pat-ccount" value={p.ccount} min={2} max={500} integer onCommit={(ccount) => p.set({ ccount })} /></FieldRow>
          <FieldRow label="Total angle" htmlFor="pat-angle" hint="360° = evenly around"><NumberInput id="pat-angle" value={p.angle} min={-360} max={360} suffix="°" onCommit={(angle) => p.set({ angle })} /></FieldRow>
          <FieldRow label="Axis"><Segmented label="Circular axis" value={p.caxis} onChange={(caxis) => p.set({ caxis })} options={AXIS} /></FieldRow>
          <FieldRow label="Radius" htmlFor="pat-radius" hint="Axis distance from the selection centre"><NumberInput id="pat-radius" value={p.radius} min={0} max={100000} suffix="mm" onCommit={(radius) => p.set({ radius })} /></FieldRow>
          <FieldRow label="Turn copies" htmlFor="pat-rot"><SwitchInput id="pat-rot" checked={p.rotateCopies} onChange={(rotateCopies) => p.set({ rotateCopies })} /></FieldRow>
        </>
      )}
      <FieldRow label="Merge into one object" htmlFor="pat-merge"><SwitchInput id="pat-merge" checked={p.merge} onChange={(merge) => p.set({ merge })} /></FieldRow>
      {!p.merge && (
        <FieldRow label="Linked copies" htmlFor="pat-linked" hint="Share one mesh: painting one paints all; a cut or boolean unlinks that copy">
          <SwitchInput id="pat-linked" checked={p.linked} onChange={(linked) => p.set({ linked })} />
        </FieldRow>
      )}
      <Button variant="primary" className="mt-1" onClick={applyPattern}>Create {total} × pattern</Button>
    </div>
  );
}

/** Ghost markers where the copies will go while the panel is open. */
export function PatternPreview() {
  const open = useSceneStore((s) => s.selectedIds.length > 0);
  const sel = useSceneStore(useShallow((s) => selectedObjects(s)));
  const p = usePatternStore();
  const invalidate = useThree((s) => s.invalidate);
  const panelOpen = useAppStore((s) => s.sidebarTab === 'edit' && !!s.panelOpen['Pattern / copies'] && !s.activeTool);
  const centres = useMemo(() => (open && sel.length ? previewCentres(sel, p) : []), [open, sel, p]);
  const size = useMemo(() => (sel.length ? boxOf(sel).getSize(new Vector3()) : new Vector3()), [sel]);
  useEffect(() => invalidate(), [centres, invalidate]);
  if (!panelOpen || !centres.length || centres.length > 2000) return null;
  return (
    <group>
      {centres.map((c, i) => (
        <mesh key={i} position={c} raycast={() => {}} renderOrder={2}>
          <boxGeometry args={[size.x, size.y, size.z]} />
          <meshBasicMaterial color="#5ad1a0" transparent opacity={0.18} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}
