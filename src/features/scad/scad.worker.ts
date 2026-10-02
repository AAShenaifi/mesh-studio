/// <reference lib="webworker" />
// OpenSCAD render worker. Loads the OpenSCAD Wasm build and font/library pack
// from this app's own /openscad/ folder (apps/mesh-studio/public/openscad/).
// A fresh instance runs per render (OpenSCAD's main() runs once);
// the compiled module and the library pack are cached.

const ASSETS = '/openscad/';

type OpenScadFactory = (opts: Record<string, unknown>) => Promise<{
  FS: { mkdir(p: string): void; writeFile(p: string, d: Uint8Array | string): void; readFile(p: string): Uint8Array };
  callMain(args: string[]): number;
}>;

let factory: Promise<OpenScadFactory> | null = null;
let compiled: Promise<WebAssembly.Module> | null = null;
let libs: Promise<Array<[string, Uint8Array]>> | null = null;

function loadFactory() {
  factory ??= import(/* @vite-ignore */ `${ASSETS}openscad.js`).then((m: { default: OpenScadFactory }) => m.default);
  return factory;
}
function loadWasm() {
  compiled ??= fetch(`${ASSETS}openscad.wasm`).then(async (r) => {
    if (!r.ok) throw new Error(`Could not load the OpenSCAD engine (${r.status}).`);
    return WebAssembly.compile(await r.arrayBuffer());
  });
  return compiled;
}

async function gunzip(buf: ArrayBuffer): Promise<Uint8Array> {
  const u8 = new Uint8Array(buf);
  if (u8[0] !== 0x1f || u8[1] !== 0x8b) return u8; // already decoded by the server
  const stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** libs.bin: repeated [u32 pathLen][path][u32 dataLen][data], gzip-compressed. */
function loadLibs() {
  libs ??= fetch(`${ASSETS}libs.bin`).then(async (r) => {
    if (!r.ok) throw new Error(`Could not load the OpenSCAD libraries (${r.status}).`);
    const raw = await gunzip(await r.arrayBuffer());
    const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    const dec = new TextDecoder();
    const out: Array<[string, Uint8Array]> = [];
    for (let o = 0; o < raw.length; ) {
      const pl = dv.getUint32(o, true); o += 4;
      const path = dec.decode(raw.subarray(o, o + pl)); o += pl;
      const dl = dv.getUint32(o, true); o += 4;
      out.push([path, raw.subarray(o, o + dl)]); o += dl;
    }
    return out;
  });
  return libs;
}

function ensureDir(FS: { mkdir(p: string): void }, dir: string, made: Set<string>) {
  let cur = '';
  for (const part of dir.split('/').filter(Boolean)) {
    cur += '/' + part;
    if (made.has(cur)) continue;
    try { FS.mkdir(cur); } catch { /* exists */ }
    made.add(cur);
  }
}

interface RenderMsg {
  id: number;
  code: string;
  defines: Record<string, string>;
  files: Array<{ path: string; data: ArrayBuffer }>;
}

async function render(msg: RenderMsg) {
  const t0 = performance.now();
  const [OpenSCAD, wasmModule, pack] = await Promise.all([loadFactory(), loadWasm(), loadLibs()]);
  const log: string[] = [];
  const inst = await OpenSCAD({
    noInitialRun: true,
    print: (s: string) => log.push(s),
    printErr: (s: string) => log.push(s),
    instantiateWasm: (imports: WebAssembly.Imports, receive: (i: WebAssembly.Instance) => void) => {
      void WebAssembly.instantiate(wasmModule, imports).then(receive);
      return {};
    },
  });
  const made = new Set<string>();
  const usesBosl = /BOSL2/.test(msg.code);
  for (const [path, data] of pack) {
    if (!usesBosl && path.startsWith('libraries/')) continue;
    ensureDir(inst.FS, '/' + path.split('/').slice(0, -1).join('/'), made);
    inst.FS.writeFile('/' + path, data);
  }
  for (const f of msg.files) {
    ensureDir(inst.FS, '/' + f.path.split('/').slice(0, -1).join('/'), made);
    inst.FS.writeFile('/' + f.path.replace(/^\//, ''), new Uint8Array(f.data));
  }
  inst.FS.writeFile('/model.scad', msg.code);
  const args = ['/model.scad', '--backend=manifold', '--export-format=binstl', '-o', '/out.stl'];
  for (const [k, v] of Object.entries(msg.defines)) args.push('-D', `${k}=${v}`);
  let exit = 0;
  try {
    exit = inst.callMain(args);
  } catch (e) {
    exit = -1;
    log.push(`ERROR: OpenSCAD crashed: ${e instanceof Error ? e.message : String(e)}`);
  }
  let stl: Uint8Array | null = null;
  try { stl = inst.FS.readFile('/out.stl'); } catch { /* no output */ }
  const ms = Math.round(performance.now() - t0);
  if (stl && stl.length > 84) {
    const copy = stl.slice().buffer;
    (self as unknown as Worker).postMessage({ id: msg.id, ok: true, stl: copy, log, ms }, [copy]);
  } else {
    if (!log.some((l) => /ERROR/.test(l))) log.push(`ERROR: No geometry was produced (exit ${exit}). The model may be empty.`);
    (self as unknown as Worker).postMessage({ id: msg.id, ok: false, log, ms });
  }
}

self.onmessage = async (e: MessageEvent<RenderMsg & { type?: 'warmup' }>) => {
  const msg = e.data;
  try {
    if (msg.type === 'warmup') {
      await Promise.all([loadFactory(), loadWasm(), loadLibs()]);
      (self as unknown as Worker).postMessage({ id: msg.id, ok: true, log: [], ms: 0 });
      return;
    }
    await render(msg);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id: msg.id, ok: false, log: [`ERROR: ${err instanceof Error ? err.message : String(err)}`], ms: 0 });
  }
};
