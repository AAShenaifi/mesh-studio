import { useAppStore } from '../store/useAppStore';
import { useSceneStore } from '../store/useSceneStore';
import { useSettingsStore } from '../store/useSettingsStore';

export function StatusBar() {
  const status = useAppStore((s) => s.status);
  const hasError = useAppStore((s) => s.error !== null);
  const busy = useAppStore((s) => s.busy);
  const count = useSceneStore((s) => s.objects.length);
  const sel = useSceneStore((s) => s.selectedIds.length);
  const units = useSettingsStore((s) => s.units);
  const snap = useSettingsStore((s) => s.snap);
  const isolated = typeof window !== 'undefined' && window.crossOriginIsolated === true;
  const text = busy ? `${busy}…` : status.kind === 'loading' ? `Loading ${status.name}…` : status.kind === 'ready' ? status.message : 'Ready. Drop STL, OBJ, GLB or glTF files.';
  const dot = busy || status.kind === 'loading' ? 'bg-warn animate-pulse' : hasError ? 'bg-err' : status.kind === 'ready' ? 'bg-ok' : 'bg-faint';
  return (
    <footer className="flex h-8 shrink-0 items-center gap-3 border-t border-line bg-surface px-3 text-xs" role="status" aria-live="polite">
      <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate" data-testid="status-text">{text}</span>
      <span className="text-muted">{count} object{count === 1 ? '' : 's'}{sel ? ` · ${sel} selected` : ''}</span>
      <span className="text-muted">Z-up · {units}{snap ? ' · snap' : ''}</span>
      <span className={isolated ? 'text-ok' : 'text-warn'} title={isolated ? 'Cross-origin isolated: SharedArrayBuffer available.' : 'Not cross-origin isolated: COOP/COEP headers missing.'}>
        {isolated ? 'Isolated ✓' : 'Not isolated'}
      </span>
    </footer>
  );
}
