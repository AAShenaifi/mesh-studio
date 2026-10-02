// Parses OpenSCAD Customizer annotations into parameter descriptions:
//   name = 10; // [1:0.5:100] Label     → slider
//   name = "a"; // [a:Label A, b:Label B] Label → select
//   name = true; // Label              → checkbox
//   /* [Group] */ starts a group; /* [Hidden] */ ends the parameters.

export type ParamType = 'number' | 'range' | 'bool' | 'string' | 'select';

export interface ScadParam {
  name: string;
  type: ParamType;
  value: number | string | boolean;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ value: string; label: string }>;
  /** For selects: whether option values are numbers or strings. */
  valueType?: 'number' | 'string';
}

export interface ParamGroup {
  name: string;
  params: ScadParam[];
}

export function parseCustomizer(code: string): ParamGroup[] {
  const groups: ParamGroup[] = [{ name: 'Parameters', params: [] }];
  let group = groups[0]!;
  let depth = 0;
  let lastComment = '';
  for (const raw of code.split('\n')) {
    const line = raw.trim();
    const g = /^\/\*\s*\[(.+?)\]\s*\*\/$/.exec(line);
    if (g) {
      if (/^hidden$/i.test(g[1]!.trim())) break;
      group = { name: g[1]!.trim(), params: [] };
      groups.push(group);
      lastComment = '';
      continue;
    }
    if (depth === 0 && /^(module|function)\b/.test(line)) break;
    if (line.startsWith('//')) {
      lastComment = line.replace(/^\/\/\s?/, '');
      continue;
    }
    const m = depth === 0 ? /^([A-Za-z_]\w*)\s*=\s*(.+?);\s*(?:\/\/\s*(.*))?$/.exec(line) : null;
    if (!m) {
      if (line && !/^(include|use)\b/.test(line) && !line.startsWith('$')) {
        depth += (line.match(/[{([]/g) ?? []).length - (line.match(/[})\]]/g) ?? []).length;
        if (depth < 0) depth = 0;
      }
      if (!line) lastComment = '';
      continue;
    }
    const [, name, rawValue, comment = ''] = m as unknown as [string, string, string, string?];
    const v = rawValue.trim();
    let value: number | string | boolean;
    let type: ParamType;
    if (/^-?\d+(\.\d+)?(e-?\d+)?$/i.test(v)) { value = +v; type = 'number'; }
    else if (v === 'true' || v === 'false') { value = v === 'true'; type = 'bool'; }
    else if (/^"(?:[^"\\]|\\.)*"$/.test(v)) { value = JSON.parse(v) as string; type = 'string'; }
    else continue; // expressions are not user parameters
    const spec = /^\[(.*)\]\s*(.*)$/.exec(comment);
    const p: ScadParam = { name, type, value, label: (spec ? spec[2] : comment) || lastComment || name.replace(/_/g, ' ') };
    if (spec) {
      const parts = spec[1]!.split(',').map((x) => x.trim()).filter(Boolean);
      if (parts.length === 1 && type === 'number' && /^-?[\d.]+(\s*:\s*-?[\d.]+){0,2}$/.test(parts[0]!)) {
        const n = parts[0]!.split(':').map(Number);
        if (n.length === 1) Object.assign(p, { min: 0, max: n[0], step: 1 });
        else if (n.length === 2) Object.assign(p, { min: n[0], max: n[1], step: 1 });
        else Object.assign(p, { min: n[0], step: n[1], max: n[2] });
        p.type = 'range';
      } else if (parts.length) {
        p.options = parts.map((o) => {
          const i = o.indexOf(':');
          return i > -1 ? { value: o.slice(0, i).trim(), label: o.slice(i + 1).trim() } : { value: o, label: o };
        });
        p.valueType = type === 'number' ? 'number' : 'string';
        p.type = 'select';
      }
    }
    group.params.push(p);
    lastComment = '';
  }
  return groups.filter((g) => g.params.length);
}

/** -D value for a parameter. */
export function defineValue(p: ScadParam, v: unknown): string {
  if (p.type === 'bool') return v ? 'true' : 'false';
  if (p.type === 'select') return p.valueType === 'number' ? String(+(v as number)) : JSON.stringify(String(v));
  if (p.type === 'string') return JSON.stringify(String(v));
  return String(+(v as number));
}

/** Only parameters that differ from the defaults become -D defines. */
export function definesFor(groups: ParamGroup[], values: Record<string, unknown>): Record<string, string> {
  const d: Record<string, string> = {};
  for (const g of groups) for (const p of g.params) if (p.name in values && values[p.name] !== p.value) d[p.name] = defineValue(p, values[p.name]);
  return d;
}
