import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { selectedObjects, useSceneStore } from '../../store/useSceneStore';
import { Button } from '../../ui/primitives';
import { saveBlob, safeName } from '../export/writers';
import { parseCustomizer } from '../scad/customizer';
import { ParamsForm } from '../scad/ParamsForm';
import { CATEGORIES, GENERATORS } from './catalog';
import { addGenerator, updateGenerator, type Values } from './generate';

const FAV_KEY = 'mesh-studio:generator-favourites';
function loadFavs(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Generator library: search, category chips, favourites (stored on this device). */
export function GeneratorsPanel() {
  const busy = useAppStore((s) => s.busy);
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<string>('all');
  const [favs, setFavs] = useState<string[]>(loadFavs);
  const toggleFav = (id: string) => {
    const next = favs.includes(id) ? favs.filter((x) => x !== id) : [...favs, id];
    setFavs(next);
    try { localStorage.setItem(FAV_KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
  };
  const q = query.trim().toLowerCase();
  const matches = GENERATORS.filter((g) => (cat === 'all' || (cat === 'fav' ? favs.includes(g.id) : g.cat === cat)) && (!q || g.name.toLowerCase().includes(q) || g.desc.toLowerCase().includes(q)));
  const chip = (id: string, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setCat(id)}
      aria-pressed={cat === id}
      className={`rounded-full border px-2 py-0.5 text-[11.5px] font-bold ${cat === id ? 'border-accent bg-accent text-white' : 'border-line text-muted hover:text-ink'}`}
    >
      {label}
    </button>
  );
  const shown = CATEGORIES.filter((c) => matches.some((g) => g.cat === c.id));
  return (
    <div className="flex flex-col gap-2" data-testid="generators">
      <input
        type="search"
        aria-label="Search generators"
        placeholder={`Search ${GENERATORS.length} generators…`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded-[7px] border border-line bg-surface-2 px-2 py-1 text-[13px] outline-none focus:border-accent-hi"
      />
      <div className="flex flex-wrap gap-1">
        {chip('all', 'All')}
        {chip('fav', `★ Favourites${favs.length ? ` (${favs.length})` : ''}`)}
        {CATEGORIES.map((c) => chip(c.id, c.name))}
      </div>
      {!matches.length && <p className="m-0 text-[12.5px] text-muted">No generator matches.</p>}
      {shown.map((c) => (
        <div key={c.id}>
          <h4 className="m-0 mb-1.5 text-[12.5px] font-bold text-muted">{c.name}</h4>
          <div className="grid grid-cols-2 gap-1.5">
            {matches.filter((g) => g.cat === c.id).map((g) => (
              <div key={g.id} className="relative">
                <button
                  type="button"
                  title={g.desc}
                  disabled={!!busy}
                  data-generator={g.id}
                  onClick={() => void addGenerator(g.id)}
                  className="w-full rounded-[7px] border border-line bg-surface-2 py-2 pl-2.5 pr-6 text-left text-[12.5px] font-bold leading-tight hover:border-line-strong hover:bg-surface-3 disabled:opacity-50"
                >
                  {g.name}
                </button>
                <button
                  type="button"
                  aria-label={`${favs.includes(g.id) ? 'Remove' : 'Add'} ${g.name} ${favs.includes(g.id) ? 'from' : 'to'} favourites`}
                  onClick={() => toggleFav(g.id)}
                  className={`absolute right-1 top-1 text-[13px] ${favs.includes(g.id) ? 'text-[#ffd166]' : 'text-faint hover:text-ink'}`}
                >
                  ★
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
      <Button onClick={() => void addCustom()} disabled={!!busy}>
        Blank OpenSCAD model
      </Button>
    </div>
  );
}

const BLANK = `/* [Size] */
width = 40; // [5:1:200] Width (mm)
depth = 30; // [5:1:200] Depth (mm)
height = 10; // [1:0.5:100] Height (mm)
rounded = true; // Rounded corners

/* [Hidden] */
$fn = 48;
r = rounded ? 3 : 0.01;
hull() for (x = [r, width - r], y = [r, depth - r]) translate([x, y, 0]) cylinder(r = r, h = height);
echo(str("INFO: Footprint ", width, " x ", depth, " mm"));
`;

async function addCustom() {
  const { renderToObject } = await import('./generate');
  const obj = await useAppStore.getState().run('Rendering OpenSCAD', () => renderToObject('OpenSCAD model', BLANK, {}));
  if (obj) useSceneStore.getState().addObjects('Add OpenSCAD model', [obj]);
}

/** Parameters, code and .scad export for the selected generator object. */
export function GeneratorParamsPanel() {
  const o = useSceneStore((s) => (s.selectedIds.length === 1 ? selectedObjects(s)[0] : undefined));
  const [code, setCode] = useState<string | null>(null);
  if (!o || o.source.kind !== 'generator' || !o.source.scad) return <p className="m-0 text-[12.5px] text-muted">Select a generated object to change its parameters.</p>;
  const src = o.source;
  const groups = parseCustomizer(src.scad!.code);
  const values: Values = { ...(src.values ?? {}) };
  const change = (name: string, v: number | string | boolean) => void updateGenerator(o, { ...values, [name]: v });
  return (
    <div className="flex flex-col gap-2" data-testid="generator-params">
      <p className="m-0 text-[13px] font-bold">{o.name}</p>
      <ParamsForm groups={groups} values={values} onChange={change} />
      {!!src.info?.length && (
        <div className="flex flex-col gap-1">
          {src.info.map((t) => (
            <div key={t} className="rounded border-l-[3px] border-accent-hi bg-accent/15 px-2 py-1 text-[12px]">{t}</div>
          ))}
        </div>
      )}
      <details onToggle={(e) => (e.currentTarget.open ? setCode(src.scad!.code) : setCode(null))}>
        <summary className="cursor-pointer text-[12.5px] font-bold text-muted">OpenSCAD code</summary>
        {code !== null && (
          <>
            <textarea aria-label="OpenSCAD code" spellCheck={false} value={code} onChange={(e) => setCode(e.target.value)} className="mt-1 h-60 w-full resize-y rounded-[7px] border border-line bg-page p-2 font-mono text-[11.5px] leading-snug" />
            <Button className="mt-1 w-full" onClick={() => void updateGenerator(o, {}, code)}>
              Render code
            </Button>
          </>
        )}
      </details>
      <div className="grid grid-cols-2 gap-1.5">
        <Button onClick={() => void updateGenerator(o, {})}>Reset values</Button>
        <Button
          onClick={() => {
            const d = src.scad!.defines;
            const head = Object.keys(d).length ? `// Parameter values used in Mesh Studio:\n${Object.entries(d).map(([k, v]) => `// ${k} = ${v};`).join('\n')}\n\n` : '';
            saveBlob(`${safeName(o.name)}.scad`, head + src.scad!.code, 'text/plain');
          }}
        >
          Download .scad
        </Button>
      </div>
    </div>
  );
}
