import { useAppStore } from '../store/useAppStore';
import { AlertIcon, CloseIcon } from './icons';

export function ErrorBanner() {
  const error = useAppStore((s) => s.error);
  const dismiss = useAppStore((s) => s.dismissError);
  if (!error) return null;
  return (
    <div
      role="alert"
      className="absolute left-3 right-3 top-3 z-20 flex items-start gap-2.5 rounded-[9px] border border-err bg-[rgba(239,107,115,0.16)] px-3 py-2 text-[13px] font-semibold text-[#ffd3d6] backdrop-blur-md"
    >
      <AlertIcon className="mt-0.5 shrink-0 text-err" width={17} height={17} />
      <p className="m-0 min-w-0 flex-1 break-words">{error}</p>
      <button type="button" onClick={dismiss} aria-label="Dismiss error" className="shrink-0 rounded p-0.5 text-[#ffd3d6] hover:bg-white/10">
        <CloseIcon width={16} height={16} />
      </button>
    </div>
  );
}
