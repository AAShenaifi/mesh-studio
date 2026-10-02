// Client for the existing Cloudflare Pages Function /api/stl-ai (shared with STL Studio).

export type ContentBlock = { type: 'text'; text: string } | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

export interface StreamResult {
  text: string;
  thinking: string;
  inputTokens: number;
  outputTokens: number;
}

/** Streams a reply. `onDelta` gets the running text so the UI can update while it arrives. */
export async function streamDesign(
  messages: ChatMessage[],
  opts: { model: string; effort: string; passcode: string },
  onDelta: (text: string, thinking: string) => void,
  signal?: AbortSignal,
): Promise<StreamResult> {
  const res = await fetch('/api/stl-ai', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Sync-Passcode': opts.passcode },
    body: JSON.stringify({ messages, model: opts.model, effort: opts.effort }),
    signal,
  });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const j = (await res.json()) as { error?: string; detail?: string };
      if (j.error) msg = j.error + (j.detail ? `: ${j.detail.slice(0, 300)}` : '');
    } catch {
      if (res.status === 404) msg = 'The AI service is not available here (it runs as a Cloudflare Pages Function on the deployed site).';
    }
    throw new Error(msg);
  }
  if (!res.body) throw new Error('Empty response');
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const out: StreamResult = { text: '', thinking: '', inputTokens: 0, outputTokens: 0 };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.search(/\r?\n\r?\n/)) > -1) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx).replace(/^\r?\n\r?\n/, '');
      const data = chunk.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('');
      if (!data) continue;
      let ev: { type: string; delta?: { type: string; text?: string; thinking?: string }; message?: { usage?: { input_tokens?: number } }; usage?: { output_tokens?: number }; error?: { message?: string } };
      try { ev = JSON.parse(data); } catch { continue; }
      if (ev.type === 'content_block_delta' && ev.delta) {
        if (ev.delta.type === 'text_delta') out.text += ev.delta.text ?? '';
        else if (ev.delta.type === 'thinking_delta') out.thinking += ev.delta.thinking ?? '';
        onDelta(out.text, out.thinking);
      } else if (ev.type === 'message_start') out.inputTokens = ev.message?.usage?.input_tokens ?? 0;
      else if (ev.type === 'message_delta') out.outputTokens = ev.usage?.output_tokens ?? out.outputTokens;
      else if (ev.type === 'error') throw new Error(ev.error?.message ?? 'Stream error');
    }
  }
  return out;
}

/** Splits a reply into prose notes and the last fenced OpenSCAD block. */
export function splitCode(text: string): { notes: string; code: string | null; open: boolean } {
  const re = /```(?:openscad|scad)?[^\n]*\n([\s\S]*?)(```|$)/gi;
  let m: RegExpExecArray | null;
  let last: RegExpExecArray | null = null;
  while ((m = re.exec(text))) last = m;
  if (!last) return { notes: text, code: null, open: false };
  const notes = (text.slice(0, last.index) + text.slice(last.index + last[0].length)).trim();
  return { notes, code: last[2] === '```' ? last[1]! : null, open: last[2] !== '```' };
}

/** `// @bbox [x, y, z]` planned size in the code, if the model states one. */
export const plannedBBox = (code: string): [number, number, number] | null => {
  const m = /@bbox\s*\[\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\]/.exec(code);
  return m ? [+m[1]!, +m[2]!, +m[3]!] : null;
};
