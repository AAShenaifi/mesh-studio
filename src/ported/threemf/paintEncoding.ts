// Ported from Bambu Studio — src/libslic3r/TriangleSelector.cpp (TriangleSelector::serialize,
// TriangleSelector::deserialize, read_paint_nibble) and src/libslic3r/Model.cpp
// (FacetsAnnotation::get_triangle_as_string, FacetsAnnotation::set_triangle_from_string) @ da8b44e
// Original licence: AGPL-3.0 (https://github.com/bambulab/BambuStudio). Translated to TypeScript for Mesh Studio.
// Changes: encodes whole (unsplit) triangles only; decoding walks the split tree
// without rebuilding the sub-triangles and returns the state covering the largest
// share of the original triangle (each child counts 1/children of its parent),
// because Mesh Studio stores one colour per triangle. No filament delete/replace.

/** Bits for one unsplit triangle in `state` (0 = not painted, k = filament k), as serialize() emits them. */
function leafBits(state: number): boolean[] {
  const bits: boolean[] = [false, false]; // split sides = 0
  let n = state;
  if (n >= 3) {
    bits.push(true, true);
    n -= 3;
    while (n >= 15) {
      bits.push(true, true, true, true);
      n -= 15;
    }
    for (let i = 0; i < 4; i++) bits.push(!!(n & (1 << i)));
  } else {
    bits.push(!!(n & 0b01), !!(n & 0b10));
  }
  return bits;
}

/** Hex string as written in 3MF `paint_color` / `slic3rpe:mmu_segmentation` (nibbles reversed, upper case). */
export function encodeTriangleState(state: number): string {
  if (state <= 0) return '';
  const bits = leafBits(state);
  let out = '';
  for (let o = 0; o < bits.length; o += 4) {
    let code = 0;
    for (let i = 3; i >= 0; i--) code = (code << 1) | (bits[o + i] ? 1 : 0);
    out = (code < 10 ? String(code) : String.fromCharCode(55 + code)) + out;
  }
  return out;
}

/** Nibbles in stream order from the 3MF string (last character first). Null when malformed. */
function nibbles(str: string): number[] | null {
  const out: number[] = [];
  for (let i = str.length - 1; i >= 0; i--) {
    const c = str.charCodeAt(i);
    if (c >= 48 && c <= 57) out.push(c - 48);
    else if (c >= 65 && c <= 70) out.push(c - 55);
    else return null;
  }
  return out;
}

/**
 * Decodes one triangle's string. Returns the area share of each state
 * (state → fraction of the triangle) or null when the string is empty/invalid.
 */
export function decodeTriangleStates(str: string): Map<number, number> | null {
  if (!str) return null;
  const nb = nibbles(str);
  if (!nb || !nb.length) return null;
  let i = 0;
  const next = () => (i < nb.length ? nb[i++]! : -1);
  const shares = new Map<number, number>();
  // depth-first: stack of { weight per child, children left }
  const stack: Array<{ w: number; left: number }> = [];
  let weight = 1;
  for (;;) {
    const code = next();
    if (code < 0) return shares.size ? shares : null;
    const split = code & 0b11;
    if (split) {
      const children = split + 1;
      stack.push({ w: weight / children, left: children });
      weight = weight / children;
      continue;
    }
    let state: number;
    if ((code & 0b1100) === 0b1100) {
      let nc = next();
      let k = 0;
      while (nc === 0b1111) { k++; nc = next(); }
      if (nc < 0) return shares.size ? shares : null;
      state = nc + 15 * k + 3;
    } else state = code >> 2;
    shares.set(state, (shares.get(state) ?? 0) + weight);
    // climb up while parents are complete
    for (;;) {
      const top = stack[stack.length - 1];
      if (!top) return shares;
      top.left--;
      if (top.left > 0) { weight = top.w; break; }
      stack.pop();
    }
  }
}

/** The state covering most of the triangle (ties → lowest state), or null. */
export function dominantState(str: string): number | null {
  const s = decodeTriangleStates(str);
  if (!s) return null;
  let best = -1, bestW = -1;
  for (const [k, w] of [...s.entries()].sort((a, b) => a[0] - b[0])) if (w > bestW + 1e-12) { best = k; bestW = w; }
  return best;
}
