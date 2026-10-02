// Main-thread client for the OpenSCAD worker: one render at a time, with a timeout.

export interface ScadResult {
  ok: boolean;
  stl?: ArrayBuffer;
  log: string[];
  ms: number;
}

let worker: Worker | null = null;
let seq = 0;
const waiting = new Map<number, { resolve: (r: ScadResult) => void; timer: number }>();
let chain: Promise<unknown> = Promise.resolve();

function spawn(): Worker {
  const w = new Worker(new URL('./scad.worker.ts', import.meta.url), { type: 'module', name: 'openscad' });
  w.onmessage = (e: MessageEvent<ScadResult & { id: number }>) => {
    const p = waiting.get(e.data.id);
    if (!p) return;
    waiting.delete(e.data.id);
    clearTimeout(p.timer);
    p.resolve(e.data);
  };
  w.onerror = (e) => {
    for (const p of waiting.values()) p.resolve({ ok: false, log: [`ERROR: OpenSCAD worker failed: ${e.message || 'unknown'}`], ms: 0 });
    waiting.clear();
  };
  return w;
}

function call(msg: Record<string, unknown>, timeout: number, transfer: Transferable[] = []): Promise<ScadResult> {
  worker ??= spawn();
  const id = ++seq;
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      waiting.delete(id);
      worker?.terminate();
      worker = null;
      resolve({ ok: false, log: [`ERROR: Render took longer than ${timeout / 1000} s and was stopped. Lower $fn or simplify the model.`], ms: timeout });
    }, timeout);
    waiting.set(id, { resolve, timer });
    worker!.postMessage({ ...msg, id }, transfer);
  });
}

/** Renders OpenSCAD code to binary STL. Renders are serialised (one Wasm instance at a time). */
export function renderScad(code: string, defines: Record<string, string> = {}, files: Array<{ path: string; data: ArrayBuffer }> = []): Promise<ScadResult> {
  const job = chain.then(() => call({ code, defines, files }, 180_000, files.map((f) => f.data)));
  chain = job.catch(() => undefined);
  return job;
}

export function warmupScad(): Promise<ScadResult> {
  return call({ type: 'warmup' }, 180_000);
}

/** Lines echoed with `echo("INFO: …")` become facts shown to the user. */
export const infoLines = (log: string[]) => log.filter((l) => /^ECHO: "INFO:/.test(l)).map((l) => l.replace(/^ECHO: "INFO:\s*/, '').replace(/"$/, ''));
export const errorLines = (log: string[]) => log.filter((l) => /ERROR|TRACE|WARNING: (Ignoring unknown|Unable to|Can't open|Object may not be a valid)/.test(l));
