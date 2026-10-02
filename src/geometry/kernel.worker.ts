/// <reference lib="webworker" />
// Geometry kernel worker: manifold-3d (Wasm) plus pure-JS mesh analysis, off the main thread.
import { KernelError, freeScope, ops } from './kernelCore';
import './kernelOps';
import './kernelOpsPrep';
import './kernelOpsSurface';
import type { KernelRequest } from './protocol';

function transferables(value: unknown, out: Transferable[] = []): Transferable[] {
  if (ArrayBuffer.isView(value)) out.push(value.buffer as ArrayBuffer);
  else if (Array.isArray(value)) value.forEach((v) => transferables(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => transferables(v, out));
  return [...new Set(out)];
}

self.onmessage = async (e: MessageEvent<KernelRequest>) => {
  const { id, op, args } = e.data;
  try {
    const fn = ops[op];
    if (!fn) throw new KernelError(`Unknown kernel operation: ${op}`);
    const result = await fn(args as never);
    (self as unknown as Worker).postMessage({ id, ok: true, result }, transferables(result));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    (self as unknown as Worker).postMessage({ id, ok: false, error: message, known: err instanceof KernelError });
  } finally {
    freeScope();
  }
};
