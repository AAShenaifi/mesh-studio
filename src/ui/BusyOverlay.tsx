import { useAppStore } from '../store/useAppStore';

/** Spinner for file loads and long tool operations. */
export function BusyOverlay() {
  const status = useAppStore((s) => s.status);
  const busy = useAppStore((s) => s.busy);
  const label = busy ?? (status.kind === 'loading' ? `Loading ${status.name}` : null);
  if (!label) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
      <div role="status" className="flex items-center gap-2.5 rounded-[9px] border border-line bg-surface/90 px-4 py-2.5 text-[13px] font-semibold backdrop-blur-md">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent-soft border-t-transparent" aria-hidden="true" />
        {label}…
      </div>
    </div>
  );
}
