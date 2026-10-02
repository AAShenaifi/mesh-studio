import { useAppStore } from '../store/useAppStore';
import { AlertIcon, CloseIcon } from './icons';

/** Yellow, non-blocking warning (e.g. non-manifold mesh, floating parts). */
export function NoticeBar() {
  const notice = useAppStore((s) => s.notice);
  const error = useAppStore((s) => s.error);
  if (!notice) return null;
  return (
    <div className={`absolute left-3 right-3 z-20 flex items-start gap-2.5 rounded-[9px] border border-warn bg-[rgba(240,182,78,0.16)] px-3 py-2 text-[12.5px] font-semibold text-[#ffe2a8] backdrop-blur-md ${error ? 'top-16' : 'top-3'}`} role="note">
      <AlertIcon className="mt-0.5 shrink-0 text-warn" width={16} height={16} />
      <p className="m-0 min-w-0 flex-1">{notice}</p>
      <button type="button" aria-label="Dismiss notice" onClick={() => useAppStore.getState().setNotice(null)} className="shrink-0 rounded p-0.5 hover:bg-white/10">
        <CloseIcon width={15} height={15} />
      </button>
    </div>
  );
}
