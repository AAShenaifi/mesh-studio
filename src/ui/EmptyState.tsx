import { useAppStore } from '../store/useAppStore';
import { useSceneStore } from '../store/useSceneStore';

export function EmptyState() {
  const empty = useSceneStore((s) => s.objects.length === 0);
  const loading = useAppStore((s) => s.status.kind === 'loading');
  if (!empty || loading) return null;
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center p-5 text-center text-faint">
      <div>
        <b className="block text-base text-muted">Empty workspace</b>
        Drop models here, use Open in the toolbar, or create something in the Create tab.
      </div>
    </div>
  );
}
