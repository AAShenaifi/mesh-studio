import { useAppStore } from '../../store/useAppStore';
import { droppedToGrid, useSceneStore } from '../../store/useSceneStore';
import { createObject } from '../../scene/create';
import type { SceneObject } from '../../scene/types';
import { stlToSoup } from '../../loaders/stlSoup';
import { definesFor, parseCustomizer } from '../scad/customizer';
import { errorLines, infoLines, renderScad } from '../scad/scad';
import { GENERATORS } from './catalog';

export class ScadError extends Error {
  constructor(public log: string[]) {
    super(errorLines(log).slice(0, 4).join(' ') || 'OpenSCAD could not render this model.');
  }
}

export type Values = Record<string, number | string | boolean>;

/** Renders OpenSCAD code with values into a new (unplaced) scene object. */
export async function renderToObject(name: string, code: string, values: Values, generatorId?: string): Promise<SceneObject> {
  const groups = parseCustomizer(code);
  const defines = definesFor(groups, values);
  const res = await renderScad(code, defines);
  if (!res.ok || !res.stl) throw new ScadError(res.log);
  const { positions, faceColors } = stlToSoup(res.stl);
  const obj = createObject(name, positions, faceColors, { kind: 'generator', generatorId, scad: { code, defines }, values, info: infoLines(res.log) }, 'beside');
  return obj;
}

export async function addGenerator(id: string) {
  const g = GENERATORS.find((x) => x.id === id);
  if (!g) return;
  const obj = await useAppStore.getState().run(`Rendering ${g.name}`, () => renderToObject(g.name, g.scad, {}, g.id));
  if (!obj) return;
  useSceneStore.getState().addObjects(`Add ${g.name}`, [obj]);
  useAppStore.getState().setReady(`${g.name} rendered`);
  useAppStore.getState().requestCamera('fit', 'selection');
}

let latest = 0;
/** Re-renders a generator object with new values/code, keeping its place (latest request wins). */
export async function updateGenerator(o: SceneObject, values: Values, code = o.source.scad?.code ?? '') {
  const token = ++latest;
  const app = useAppStore.getState();
  app.setLoading(o.name);
  try {
    const next = await renderToObject(o.name, code, values, o.source.generatorId);
    if (token !== latest) return;
    const cur = useSceneStore.getState().objects.find((x) => x.id === o.id);
    if (!cur) {
      app.setReady('Object was removed');
      return;
    }
    const placed = droppedToGrid({ ...next, id: o.id, name: cur.name, position: [cur.position[0], cur.position[1], 0], rotation: cur.rotation, scale: cur.scale, visible: cur.visible });
    useSceneStore.getState().replaceObjects(`Edit ${o.name}`, [o.id], [placed]);
    app.setReady(`${o.name} updated`);
  } catch (err) {
    if (token !== latest) return;
    app.setError(`${o.name}: ${err instanceof Error ? err.message : String(err)}`);
    app.setReady('Render failed');
  }
}
