import { useAppStore, type ViewPreset } from '../store/useAppStore';
import { useSceneStore, type GizmoMode } from '../store/useSceneStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { pickFiles } from '../loaders/pickFiles';
import {
  CameraIcon, CopyIcon, CubeIcon, DownloadIcon, FitIcon, GridIcon, KeyboardIcon, MoveIcon, OpenIcon, RedoIcon,
  RotateIcon, ScaleIcon, SettingsIcon, TrashIcon, UndoIcon,
} from './icons';
import { ToolButton, ToolGroup } from './primitives';
import { saveSnapshot } from './snapshot';

const VIEWS: Array<{ view: ViewPreset; label: string; short: string }> = [
  { view: 'front', label: 'Front view (1)', short: 'Front' },
  { view: 'right', label: 'Right view (3)', short: 'Right' },
  { view: 'top', label: 'Top view (7)', short: 'Top' },
];

const MODES: Array<{ mode: GizmoMode; label: string; Icon: typeof MoveIcon }> = [
  { mode: 'translate', label: 'Move (W)', Icon: MoveIcon },
  { mode: 'rotate', label: 'Rotate (E)', Icon: RotateIcon },
  { mode: 'scale', label: 'Scale (R)', Icon: ScaleIcon },
];

export function TopToolbar() {
  const requestCamera = useAppStore((s) => s.requestCamera);
  const setDialog = useAppStore((s) => s.setDialog);
  const loading = useAppStore((s) => s.status.kind === 'loading');
  const gridVisible = useSettingsStore((s) => s.gridVisible);
  const update = useSettingsStore((s) => s.update);
  const canUndo = useSceneStore((s) => s.past.length > 0);
  const canRedo = useSceneStore((s) => s.future.length > 0);
  const undoLabel = useSceneStore((s) => s.past[s.past.length - 1]?.label);
  const redoLabel = useSceneStore((s) => s.future[0]?.label);
  const hasSel = useSceneStore((s) => s.selectedIds.length > 0);
  const hasObjects = useSceneStore((s) => s.objects.length > 0);
  const mode = useSceneStore((s) => s.gizmoMode);
  const scene = useSceneStore.getState;
  const showEdges = useAppStore((s) => s.showEdges);
  const toggleEdges = useAppStore((s) => s.toggleEdges);
  const measuring = useAppStore((s) => s.activeTool === 'measure');
  const setActiveTool = useAppStore((s) => s.setActiveTool);

  return (
    <header className="flex h-[54px] shrink-0 items-center gap-3 border-b border-line bg-surface px-3.5">
      <div className="flex items-center gap-2 text-[17px] font-extrabold tracking-[0.2px]">
        <img src="/icon-192.png" alt="" aria-hidden="true" width={24} height={24} className="inline-block h-6 w-6 rounded-md" />
        <span className="max-lg:hidden">Mesh Studio</span>
      </div>
      <div className="mx-1 h-6 w-px bg-line" aria-hidden="true" />

      <nav aria-label="Toolbar" className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
        <ToolGroup label="File">
          <ToolButton label="Open" showLabel onClick={pickFiles} disabled={loading}>
            <OpenIcon />
          </ToolButton>
          <ToolButton label="Export (Ctrl+E)" onClick={() => setDialog('export')} disabled={!hasObjects}>
            <DownloadIcon />
          </ToolButton>
          <ToolButton label="Save image (PNG)" onClick={saveSnapshot} disabled={!hasObjects}>
            <CameraIcon />
          </ToolButton>
        </ToolGroup>
        <ToolGroup label="History">
          <ToolButton label={canUndo ? `Undo ${undoLabel} (Ctrl+Z)` : 'Undo (Ctrl+Z)'} onClick={() => scene().undo()} disabled={!canUndo}>
            <UndoIcon />
          </ToolButton>
          <ToolButton label={canRedo ? `Redo ${redoLabel} (Ctrl+Y)` : 'Redo (Ctrl+Y)'} onClick={() => scene().redo()} disabled={!canRedo}>
            <RedoIcon />
          </ToolButton>
        </ToolGroup>
        <ToolGroup label="Transform">
          {MODES.map(({ mode: m, label, Icon }) => (
            <ToolButton key={m} label={label} active={mode === m} onClick={() => scene().setGizmoMode(m)}>
              <Icon />
            </ToolButton>
          ))}
        </ToolGroup>
        <ToolGroup label="Object">
          <ToolButton label="Duplicate (Ctrl+D)" onClick={() => scene().duplicateSelected()} disabled={!hasSel}>
            <CopyIcon />
          </ToolButton>
          <ToolButton label="Delete (Del)" onClick={() => scene().removeSelected()} disabled={!hasSel}>
            <TrashIcon />
          </ToolButton>
        </ToolGroup>
        <ToolGroup label="Camera">
          <ToolButton label="Fit view (F: selection, Shift+F: all)" onClick={() => requestCamera('fit', hasSel ? 'selection' : 'all')}>
            <FitIcon />
          </ToolButton>
          <ToolButton label="Isometric view (0)" onClick={() => requestCamera('iso')}>
            <CubeIcon />
          </ToolButton>
          {VIEWS.map((v) => (
            <ToolButton key={v.view} label={v.label} onClick={() => requestCamera(v.view)}>
              <span className="px-0.5">{v.short}</span>
            </ToolButton>
          ))}
        </ToolGroup>
        <ToolGroup label="Display">
          <ToolButton label="Grid (G)" active={gridVisible} onClick={() => update({ gridVisible: !gridVisible })}>
            <GridIcon />
          </ToolButton>
          <ToolButton label="Edges (K)" active={showEdges} onClick={toggleEdges}>
            <span className="px-0.5">Edges</span>
          </ToolButton>
          <ToolButton label="Measure two points (M)" active={measuring} onClick={() => setActiveTool(measuring ? null : 'measure')} disabled={!hasObjects}>
            <span className="px-0.5">Measure</span>
          </ToolButton>
        </ToolGroup>
      </nav>

      <ToolGroup label="App">
        <ToolButton label="Keyboard shortcuts (?)" onClick={() => setDialog('shortcuts')}>
          <KeyboardIcon />
        </ToolButton>
        <ToolButton label="Settings" onClick={() => setDialog('settings')}>
          <SettingsIcon />
        </ToolButton>
      </ToolGroup>
    </header>
  );
}
