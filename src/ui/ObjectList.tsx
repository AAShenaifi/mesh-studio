import { useSceneStore } from '../store/useSceneStore';
import { triCount } from '../scene/types';
import { EyeIcon, EyeOffIcon } from './icons';

export function ObjectList() {
  const objects = useSceneStore((s) => s.objects);
  const selectedIds = useSceneStore((s) => s.selectedIds);
  const { select, updateObject } = useSceneStore.getState();
  if (!objects.length) return <p className="m-0 text-[12.5px] text-muted">No objects yet.</p>;
  return (
    <ul className="m-0 flex list-none flex-col gap-0.5 p-0" aria-label="Objects" role="listbox" aria-multiselectable="true">
      {objects.map((o) => {
        const sel = selectedIds.includes(o.id);
        return (
          <li
            key={o.id}
            role="option"
            aria-selected={sel}
            data-object-id={o.id}
            onClick={(e) => select([o.id], e.shiftKey || e.ctrlKey || e.metaKey ? 'toggle' : 'replace')}
            className={`group flex cursor-pointer items-center gap-2 rounded-[7px] border px-2 py-1.5 ${
              sel ? 'border-accent-hi bg-accent/20' : 'border-transparent hover:bg-surface-2'
            } ${o.visible ? '' : 'opacity-50'}`}
          >
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold" title={o.name}>
              {o.name}
            </span>
            <span className="font-mono text-[11px] text-faint">{triCount(o).toLocaleString()}</span>
            <button
              type="button"
              aria-label={o.visible ? `Hide ${o.name}` : `Show ${o.name}`}
              onClick={(e) => {
                e.stopPropagation();
                updateObject(o.visible ? 'Hide' : 'Show', o.id, { visible: !o.visible });
              }}
              className="rounded p-0.5 text-muted hover:bg-surface-3 hover:text-ink"
            >
              {o.visible ? <EyeIcon width={15} height={15} /> : <EyeOffIcon width={15} height={15} />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
