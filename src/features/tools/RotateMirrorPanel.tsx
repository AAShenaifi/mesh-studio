import { useSceneStore } from '../../store/useSceneStore';
import { Button } from '../../ui/primitives';
import { mirror, rotate90 } from './transformOps';

/** STL Studio "Rotate / Mirror" port: 90° steps about world axes, mirrors, then back on the grid. */
export function RotateMirrorPanel() {
  const hasSel = useSceneStore((s) => s.selectedIds.length > 0);
  if (!hasSel) return <p className="m-0 text-[12.5px] text-muted">Select objects to rotate in 90° steps or mirror them. Any angle: use the Rotation fields in the Scene tab or the E gizmo.</p>;
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {(['x', 'y', 'z'] as const).map((a) => (
        <div key={a} className="flex flex-col gap-1">
          <Button className="!px-1 text-xs" onClick={() => rotate90(a, 1)} aria-label={`Rotate ${a.toUpperCase()} +90`}>{a.toUpperCase()} +90°</Button>
          <Button className="!px-1 text-xs" onClick={() => rotate90(a, -1)} aria-label={`Rotate ${a.toUpperCase()} -90`}>{a.toUpperCase()} −90°</Button>
          <Button className="!px-1 text-xs" onClick={() => mirror(a)} aria-label={`Mirror ${a.toUpperCase()}`}>Mirror {a.toUpperCase()}</Button>
        </div>
      ))}
    </div>
  );
}
