import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { selectedObjects, useSceneStore } from '../../store/useSceneStore';
import { safeStorage } from '../../settings/safeStorage';
import { worldBox } from '../../scene/geometry';
import { Button } from '../../ui/primitives';
import { ScadError, renderToObject } from '../generators/generate';
import { errorLines } from '../scad/scad';
import { plannedBBox, splitCode, streamDesign, type ChatMessage } from './aiClient';

const KEY = 'mesh-studio:ai';
interface Prefs { model: string; effort: string; passcode: string; autoFix: boolean }
const load = (): Prefs => {
  try { return { model: 'claude-sonnet-5-5', effort: 'medium', passcode: '', autoFix: true, ...JSON.parse(safeStorage.getItem(KEY) as string ?? '{}') }; }
  catch { return { model: 'claude-sonnet-5-5', effort: 'medium', passcode: '', autoFix: true }; }
};

interface Item { kind: 'user' | 'bot' | 'sys'; text: string; pills?: string[] }

const EXAMPLES = [
  'Wall bracket for a 32 mm pipe: U-clamp, 5 mm thick, 20 mm wide, two M4 countersunk screw holes 50 mm apart.',
  'Enclosure for an ESP32 DevKit (51.5 x 28.3 mm board) with a USB cutout on one short side, 2 mm walls.',
  'Holder for 12 hex screwdriver bits (1/4 inch) in 3 rows of 4, 10 mm spacing.',
];

/** STL Studio "AI Designer" port: prompt → OpenSCAD (Claude via /api/stl-ai) → editable generator object. */
export function AiPanel() {
  const [prefs, setPrefs] = useState<Prefs>(load);
  const [prompt, setPrompt] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState('');
  const messages = useRef<ChatMessage[]>([]);
  const target = useSceneStore((s) => (s.selectedIds.length === 1 ? selectedObjects(s)[0] : undefined));
  useEffect(() => {
    void safeStorage.setItem(KEY, JSON.stringify(prefs));
  }, [prefs]);

  const turn = async (budget: number, name: string) => {
    let reply;
    try {
      reply = await streamDesign(messages.current, prefs, (t) => setLive(splitCode(t).notes.slice(-600)));
    } catch (err) {
      messages.current.pop();
      setItems((x) => [...x, { kind: 'sys', text: `AI error: ${err instanceof Error ? err.message : String(err)}` }]);
      return;
    } finally {
      setLive('');
    }
    messages.current.push({ role: 'assistant', content: reply.text || '(empty)' });
    const { notes, code } = splitCode(reply.text);
    const pills = [`${(reply.inputTokens / 1000).toFixed(1)}k in / ${(reply.outputTokens / 1000).toFixed(1)}k out`];
    if (!code) {
      setItems((x) => [...x, { kind: 'bot', text: notes, pills: [...pills, 'No code in the answer'] }]);
      return;
    }
    try {
      const obj = await renderToObject(name, code, {});
      useSceneStore.getState().addObjects(`AI: ${name}`, [obj]);
      const planned = plannedBBox(code);
      const b = worldBox(obj);
      const got = [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z];
      const bad = planned && planned.some((v, i) => Math.abs(got[i]! - v) > Math.max(0.6, v * 0.02));
      setItems((x) => [...x, { kind: 'bot', text: notes, pills: [...pills, 'Rendered', ...(planned ? [bad ? 'Size differs from the plan' : 'Size matches the plan'] : [])] }]);
      if (bad && prefs.autoFix && budget > 0) {
        messages.current.push({ role: 'user', content: `[Automatic check from Mesh Studio] The rendered bounding box is ${got.map((v) => v.toFixed(2)).join(' x ')} mm but you planned ${planned!.join(' x ')} mm. Fix the model and send the complete corrected code.` });
        await turn(budget - 1, name);
      }
    } catch (err) {
      const log = err instanceof ScadError ? err.log : [String(err)];
      setItems((x) => [...x, { kind: 'bot', text: notes, pills: [...pills, 'Compile failed'] }]);
      if (prefs.autoFix && budget > 0) {
        const errs = errorLines(log);
        messages.current.push({ role: 'user', content: `[Automatic check from Mesh Studio] OpenSCAD failed to render your code. Errors:\n${(errs.length ? errs : log.slice(-12)).join('\n')}\nFix the problem and send the complete corrected code.` });
        await turn(budget - 1, name);
      }
    }
  };

  const send = async () => {
    const text = prompt.trim();
    if (!text || busy) return;
    if (!prefs.passcode) {
      setItems((x) => [...x, { kind: 'sys', text: 'Enter the passcode first (same as cloud sync / STL Studio).' }]);
      return;
    }
    let full = text;
    if (target?.source.kind === 'generator' && target.source.scad) {
      full += `\n\nStart from this existing OpenSCAD model (current parameter overrides: ${JSON.stringify(target.source.scad.defines)}):\n\`\`\`openscad\n${target.source.scad.code}\n\`\`\``;
    }
    messages.current.push({ role: 'user', content: full });
    setItems((x) => [...x, { kind: 'user', text }]);
    setPrompt('');
    setBusy(true);
    useAppStore.getState().setLoading('AI design');
    try {
      await turn(2, text.split(/\s+/).slice(0, 5).join(' '));
    } finally {
      setBusy(false);
      useAppStore.getState().setReady('AI turn finished');
    }
  };

  return (
    <div className="flex flex-col gap-2" data-testid="ai-panel">
      <details>
        <summary className="cursor-pointer text-[12.5px] font-bold text-muted">AI settings</summary>
        <div className="mt-1 grid grid-cols-2 gap-1.5 text-xs">
          <label className="flex flex-col gap-0.5">Model
            <select value={prefs.model} onChange={(e) => setPrefs({ ...prefs, model: e.target.value })} className="rounded border border-line bg-surface-2 px-1 py-0.5">
              <option value="claude-sonnet-5-5">Sonnet 5.5</option>
              <option value="claude-opus-5-5">Opus 5.5</option>
              <option value="claude-haiku-4-5-20251001">Haiku 4.5</option>
            </select>
          </label>
          <label className="flex flex-col gap-0.5">Thinking
            <select value={prefs.effort} onChange={(e) => setPrefs({ ...prefs, effort: e.target.value })} className="rounded border border-line bg-surface-2 px-1 py-0.5">
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
            </select>
          </label>
          <label className="col-span-2 flex flex-col gap-0.5">Passcode
            <input type="password" autoComplete="off" value={prefs.passcode} onChange={(e) => setPrefs({ ...prefs, passcode: e.target.value })} placeholder="Stored on this device only" className="rounded border border-line bg-surface-2 px-1.5 py-0.5" />
          </label>
          <label className="col-span-2 flex items-center gap-2"><input type="checkbox" checked={prefs.autoFix} onChange={(e) => setPrefs({ ...prefs, autoFix: e.target.checked })} /> Auto-fix compile errors and size mismatches</label>
        </div>
      </details>
      {items.length === 0 && (
        <div className="flex flex-col gap-1">
          {EXAMPLES.map((e) => (
            <button key={e} type="button" onClick={() => setPrompt(e)} className="rounded-[7px] border border-line bg-surface-2 px-2 py-1.5 text-left text-xs text-muted hover:text-ink">{e}</button>
          ))}
        </div>
      )}
      <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto" aria-live="polite">
        {items.map((it, i) => (
          <div key={i} className={`rounded-[8px] px-2.5 py-1.5 text-[12.5px] ${it.kind === 'user' ? 'self-end bg-surface-3' : it.kind === 'sys' ? 'border border-dashed border-line-strong text-muted' : 'border border-line bg-surface-2'}`}>
            <div className="whitespace-pre-wrap">{it.text.length > 1200 ? it.text.slice(0, 1200) + '…' : it.text}</div>
            {it.pills && <div className="mt-1 flex flex-wrap gap-1">{it.pills.map((p) => <span key={p} className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] text-muted">{p}</span>)}</div>}
          </div>
        ))}
        {live && <div className="rounded-[8px] border border-line bg-surface-2 px-2.5 py-1.5 text-[12px] text-muted whitespace-pre-wrap">{live}</div>}
      </div>
      <textarea aria-label="Describe the part" value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.ctrlKey || e.metaKey) && void send()} placeholder={target?.source.kind === 'generator' ? `Change “${target.name}”…` : 'Describe the part with the sizes you know'} className="min-h-20 w-full resize-y rounded-[7px] border border-line bg-surface-2 p-2 text-[13px] outline-none focus:border-accent-hi" />
      <div className="flex gap-1.5">
        <Button variant="ghost" onClick={() => { messages.current = []; setItems([]); }}>New</Button>
        <Button variant="primary" className="flex-1" disabled={busy || !prompt.trim()} onClick={() => void send()}>{busy ? 'Designing…' : 'Design it'}</Button>
      </div>
    </div>
  );
}
