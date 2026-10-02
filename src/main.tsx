import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Fonts are bundled locally: COEP require-corp blocks Google Fonts.
import '@fontsource/cairo/400.css';
import '@fontsource/cairo/600.css';
import '@fontsource/cairo/700.css';
import '@fontsource/cairo/800.css';
import './index.css';
import './features';
import { App } from './App';
import { AppErrorBoundary } from './ui/AppErrorBoundary';
import { useAppStore } from './store/useAppStore';
import { useSceneStore } from './store/useSceneStore';
import { useSettingsStore } from './store/useSettingsStore';
import * as geo from './scene/geometry';
import { analyzeObject } from './features/analysis/analysisStore';
import { useCutStore } from './features/cut/cutStore';
import { useImageImportStore } from './features/imageImport/store';
import { addPrimitive, runBoolean } from './features/booleans/ops';
import { snapToObjects } from './viewport/Gizmo';
import { GENERATORS } from './features/generators/catalog';
import { renderToObject } from './features/generators/generate';
import { Box3, Vector3 } from 'three';
import { measure, measureViewport, pickFeature, useMeasureStore } from './features/measure/featureMeasure';
import { useTextStore } from './features/tools/surfaceText';
import { ghostInfo } from './features/tools/TextGhost';

// Small inspection hook for automated tests and power users (read the stores, call actions).
(window as unknown as { __meshStudio: unknown }).__meshStudio = { text: useTextStore, ghost: ghostInfo, app: useAppStore, scene: useSceneStore, settings: useSettingsStore, geo, analyze: analyzeObject, cut: useCutStore, imageImport: useImageImportStore, tools: { addPrimitive, runBoolean }, measure: { pickFeature, measure, store: useMeasureStore, viewport: measureViewport },
  generators: { list: GENERATORS, code: (name: string, code: string) => renderToObject(name, code, {}), render: (id: string) => { const g = GENERATORS.find((x) => x.id === id)!; return renderToObject(g.name, g.scad, {}, g.id); } },
  /** Object-snap maths for tests: boxes as [minX,minY,minZ,maxX,maxY,maxZ]. */
  snapToObjects: (box: number[], others: number[][], axes: string, d: number) => {
    const b = (a: number[]) => new Box3(new Vector3(a[0], a[1], a[2]), new Vector3(a[3], a[4], a[5]));
    const r = snapToObjects(b(box), others.map(b), axes, d);
    return { dx: r.delta.x, dy: r.delta.y, dz: r.delta.z, hits: r.hits.join(', ') };
  },
};

// Anything that escapes a handler becomes a visible message instead of a silent failure.
const benign = /ResizeObserver loop|AbortError|The user aborted/;
window.addEventListener('unhandledrejection', (e) => {
  const msg = e.reason instanceof Error ? e.reason.message : String(e.reason);
  if (benign.test(msg)) return;
  console.warn('[mesh-studio] unhandled rejection:', e.reason);
  useAppStore.getState().setError(`Something went wrong: ${msg}`);
});
window.addEventListener('error', (e) => {
  if (!e.message || benign.test(e.message)) return;
  useAppStore.getState().setError(`Something went wrong: ${e.message}`);
});
// Warn before leaving with edits that only live in this tab.
window.addEventListener('beforeunload', (e) => {
  if (useSceneStore.getState().objects.length && useSceneStore.getState().past.length) {
    e.preventDefault();
  }
});

const root = document.getElementById('root');
if (!root) throw new Error('#root element missing from index.html');

createRoot(root).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);
