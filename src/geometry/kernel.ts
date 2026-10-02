import type { KernelMesh, KernelResponse } from './protocol';
import { worldPositions } from '../scene/geometry';
import type { SceneObject } from '../scene/types';

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./kernel.worker.ts', import.meta.url), { type: 'module', name: 'mesh-kernel' });
  worker.onmessage = (e: MessageEvent<KernelResponse>) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    pending.delete(e.data.id);
    if (e.data.ok) p.resolve(e.data.result);
    else p.reject(new Error(e.data.error ?? 'Kernel error'));
  };
  worker.onerror = (e) => {
    const err = new Error(`Geometry worker crashed: ${e.message || 'unknown error'}`);
    for (const p of pending.values()) p.reject(err);
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

/** Runs a kernel operation in the worker. Typed arrays in `args` are transferred (do not reuse them). */
export function kernel<T>(op: string, args: unknown): Promise<T> {
  const id = ++seq;
  const transfer: Transferable[] = [];
  const walk = (v: unknown) => {
    if (ArrayBuffer.isView(v)) transfer.push(v.buffer as ArrayBuffer);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(args);
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    getWorker().postMessage({ id, op, args }, [...new Set(transfer)]);
  });
}

/** World-space copy of an object for the kernel (safe to transfer). */
export function kernelMesh(o: SceneObject): KernelMesh {
  return { positions: worldPositions(o), faceColors: o.faceColors.slice() };
}
