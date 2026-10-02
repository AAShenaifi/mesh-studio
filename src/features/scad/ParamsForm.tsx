import { useEffect, useRef, useState } from 'react';
import type { ParamGroup, ScadParam } from './customizer';
import { SwitchInput } from '../../ui/primitives';

type Values = Record<string, number | string | boolean>;

const SYMBOLS = ['♥', '★', '●', '◆', '▲', '■', '✚'];

function TextParam({ p, value, onChange }: { p: ScadParam; value: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const timer = useRef<number>(0);
  useEffect(() => setDraft(value), [value]);
  const set = (v: string) => {
    setDraft(v);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => onChange(v), 400);
  };
  return (
    <div>
      <input id={`gp-${p.name}`} dir="auto" value={draft} onChange={(e) => set(e.target.value)} className="w-full rounded-[7px] border border-line bg-surface-2 px-2 py-1 text-[13px] outline-none focus:border-accent-hi" />
      {/^word_/.test(p.name) && (
        <div className="mt-1 flex flex-wrap gap-1">
          {SYMBOLS.map((s) => (
            <button key={s} type="button" aria-label={`Insert ${s}`} onClick={() => { const v = draft + s; setDraft(v); onChange(v); }} className="min-w-7 rounded border border-line-strong bg-surface-2 px-1.5 text-sm hover:bg-surface-3">
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Auto-generated controls for OpenSCAD Customizer parameters. */
export function ParamsForm({ groups, values, onChange }: { groups: ParamGroup[]; values: Values; onChange: (name: string, v: number | string | boolean) => void }) {
  if (!groups.length) return <p className="m-0 text-[12.5px] text-muted">This model has no adjustable parameters.</p>;
  return (
    <div className="flex flex-col gap-2">
      {groups.map((g, gi) => (
        <details key={g.name} open={gi < 4} className="rounded-[10px] border border-line">
          <summary className="cursor-pointer px-3 py-1.5 text-xs font-bold uppercase tracking-[0.6px] text-accent-soft">{g.name}</summary>
          <div className="flex flex-col gap-2 px-3 pb-3 pt-1">
            {g.params.map((p) => {
              const v = values[p.name] ?? p.value;
              if (p.type === 'bool')
                return (
                  <label key={p.name} className="flex items-center justify-between gap-2 text-[13px]">
                    <span>{p.label}</span>
                    <SwitchInput id={`gp-${p.name}`} checked={!!v} onChange={(x) => onChange(p.name, x)} label={p.label} />
                  </label>
                );
              return (
                <div key={p.name}>
                  <label htmlFor={`gp-${p.name}`} className="mb-0.5 block text-[12.5px] font-semibold text-muted">{p.label}</label>
                  {p.type === 'range' ? (
                    <div className="grid grid-cols-[1fr_72px] items-center gap-2">
                      <input type="range" aria-label={p.label} min={p.min} max={p.max} step={p.step} value={Number(v)} onChange={(e) => onChange(p.name, +e.target.value)} className="w-full accent-accent-hi" />
                      <input id={`gp-${p.name}`} type="number" step={p.step ?? 'any'} value={Number(v)} onChange={(e) => e.target.value !== '' && !isNaN(+e.target.value) && onChange(p.name, +e.target.value)} className="w-full rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-right font-mono text-[12px]" />
                    </div>
                  ) : p.type === 'number' ? (
                    <input id={`gp-${p.name}`} type="number" step="any" value={Number(v)} onChange={(e) => e.target.value !== '' && !isNaN(+e.target.value) && onChange(p.name, +e.target.value)} className="w-full rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-right font-mono text-[12px]" />
                  ) : p.type === 'select' ? (
                    <select id={`gp-${p.name}`} value={String(v)} onChange={(e) => onChange(p.name, p.valueType === 'number' ? +e.target.value : e.target.value)} className="w-full rounded-[7px] border border-line bg-surface-2 px-2 py-1 text-[13px]">
                      {p.options!.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  ) : (
                    <TextParam p={p} value={String(v)} onChange={(x) => onChange(p.name, x)} />
                  )}
                </div>
              );
            })}
          </div>
        </details>
      ))}
    </div>
  );
}
