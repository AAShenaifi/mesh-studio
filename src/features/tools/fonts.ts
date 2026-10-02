// Font catalogue for the text tool. "Built-in" fonts ship inside libs.bin (always available); the others are
// small TTF files in /fonts/ that are fetched only when first used. All are SIL Open Font License (Google Fonts).
export type FontGroup = 'builtin' | 'arabic' | 'sans' | 'serif' | 'tech' | 'script' | 'custom';
export interface FontDef { id: string; label: string; name: string; group: FontGroup; file?: string; data?: ArrayBuffer }

export const GROUP_LABELS: Record<FontGroup, string> = {
  builtin: 'Built-in', arabic: 'Arabic', sans: 'Sans-serif & display', serif: 'Serif', tech: 'Tech & mono', script: 'Script & fun', custom: 'Your fonts',
};

const BUILTIN: FontDef[] = [
  { id: 'sans', label: 'Liberation Sans Bold', name: 'Liberation Sans:style=Bold', group: 'builtin' },
  { id: 'serifb', label: 'Liberation Serif Bold', name: 'Liberation Serif:style=Bold', group: 'builtin' },
  { id: 'mono', label: 'Liberation Mono Bold', name: 'Liberation Mono:style=Bold', group: 'builtin' },
  { id: 'archivo', label: 'Archivo Black', name: 'Archivo Black', group: 'builtin' },
  { id: 'anton', label: 'Anton', name: 'Anton', group: 'builtin' },
  { id: 'bebas', label: 'Bebas Neue', name: 'Bebas Neue', group: 'builtin' },
  { id: 'blackops', label: 'Black Ops One', name: 'Black Ops One', group: 'builtin' },
  { id: 'stencil', label: 'Allerta Stencil', name: 'Allerta Stencil', group: 'builtin' },
  { id: 'pacifico', label: 'Pacifico', name: 'Pacifico', group: 'builtin' },
  { id: 'tajawal', label: 'Tajawal ExtraBold (Arabic)', name: 'Tajawal:style=ExtraBold', group: 'builtin' },
  { id: 'naskh', label: 'Noto Naskh Bold (Arabic)', name: 'Noto Naskh Arabic:style=Bold', group: 'builtin' },
  { id: 'lalezar', label: 'Lalezar (Arabic)', name: 'Lalezar', group: 'builtin' },
];

const FILES: Array<[string, string, string, FontGroup, string]> = [
  ['cairo-bold', "Cairo Bold", "Cairo:style=Bold", 'arabic', 'cairo-bold.ttf'],
  ['amiri-bold', "Amiri Bold", "Amiri:style=Bold", 'arabic', 'amiri-bold.ttf'],
  ['reem-kufi-bold', "Reem Kufi Bold", "Reem Kufi:style=Bold", 'arabic', 'reem-kufi-bold.ttf'],
  ['changa-extrabold', "Changa ExtraBold", "Changa ExtraBold:style=Regular", 'arabic', 'changa-extrabold.ttf'],
  ['el-messiri-bold', "El Messiri Bold", "El Messiri:style=Bold", 'arabic', 'el-messiri-bold.ttf'],
  ['almarai-extrabold', "Almarai ExtraBold", "Almarai ExtraBold:style=Regular", 'arabic', 'almarai-extrabold.ttf'],
  ['aref-ruqaa-bold', "Aref Ruqaa Bold", "Aref Ruqaa:style=Bold", 'arabic', 'aref-ruqaa-bold.ttf'],
  ['lemonada-bold', "Lemonada Bold", "Lemonada:style=Bold", 'arabic', 'lemonada-bold.ttf'],
  ['rakkas-regular', "Rakkas", "Rakkas:style=Regular", 'arabic', 'rakkas-regular.ttf'],
  ['markazi-text-bold', "Markazi Text Bold", "Markazi Text:style=Bold", 'arabic', 'markazi-text-bold.ttf'],
  ['mada-black', "Mada Black", "Mada Black:style=Regular", 'arabic', 'mada-black.ttf'],
  ['ibm-plex-sans-arabic-bold', "IBM Plex Sans Arabic Bold", "IBM Plex Sans Arabic:style=Bold", 'arabic', 'ibm-plex-sans-arabic-bold.ttf'],
  ['noto-kufi-arabic-bold', "Noto Kufi Arabic Bold", "Noto Kufi Arabic:style=Bold", 'arabic', 'noto-kufi-arabic-bold.ttf'],
  ['katibeh-regular', "Katibeh", "Katibeh:style=Regular", 'arabic', 'katibeh-regular.ttf'],
  ['jomhuria-regular', "Jomhuria", "Jomhuria:style=Regular", 'arabic', 'jomhuria-regular.ttf'],
  ['montserrat-extrabold', "Montserrat ExtraBold", "Montserrat ExtraBold:style=Regular", 'sans', 'montserrat-extrabold.ttf'],
  ['roboto-bold', "Roboto Bold", "Roboto:style=Bold", 'sans', 'roboto-bold.ttf'],
  ['oswald-bold', "Oswald Bold", "Oswald:style=Bold", 'sans', 'oswald-bold.ttf'],
  ['poppins-extrabold', "Poppins ExtraBold", "Poppins ExtraBold:style=Regular", 'sans', 'poppins-extrabold.ttf'],
  ['inter-extrabold', "Inter ExtraBold", "Inter ExtraBold:style=Regular", 'sans', 'inter-extrabold.ttf'],
  ['rubik-extrabold', "Rubik ExtraBold", "Rubik ExtraBold:style=Regular", 'sans', 'rubik-extrabold.ttf'],
  ['teko-bold', "Teko Bold", "Teko:style=Bold", 'sans', 'teko-bold.ttf'],
  ['staatliches-regular', "Staatliches", "Staatliches:style=Regular", 'sans', 'staatliches-regular.ttf'],
  ['russo-one-regular', "Russo One", "Russo One:style=Regular", 'sans', 'russo-one-regular.ttf'],
  ['fredoka-bold', "Fredoka Bold", "Fredoka:style=Bold", 'sans', 'fredoka-bold.ttf'],
  ['paytone-one-regular', "Paytone One", "Paytone One:style=Regular", 'sans', 'paytone-one-regular.ttf'],
  ['bungee-regular', "Bungee", "Bungee:style=Regular", 'sans', 'bungee-regular.ttf'],
  ['playfair-display-bold', "Playfair Display Bold", "Playfair Display:style=Bold", 'serif', 'playfair-display-bold.ttf'],
  ['cinzel-extrabold', "Cinzel ExtraBold", "Cinzel ExtraBold:style=Regular", 'serif', 'cinzel-extrabold.ttf'],
  ['special-elite-regular', "Special Elite", "Special Elite:style=Regular", 'serif', 'special-elite-regular.ttf'],
  ['orbitron-extrabold', "Orbitron ExtraBold", "Orbitron ExtraBold:style=Regular", 'tech', 'orbitron-extrabold.ttf'],
  ['audiowide-regular', "Audiowide", "Audiowide:style=Regular", 'tech', 'audiowide-regular.ttf'],
  ['press-start-2p-regular', "Press Start 2P", "Press Start 2P:style=Regular", 'tech', 'press-start-2p-regular.ttf'],
  ['silkscreen-bold', "Silkscreen Bold", "Silkscreen:style=Bold", 'tech', 'silkscreen-bold.ttf'],
  ['share-tech-mono-regular', "Share Tech Mono", "Share Tech Mono:style=Regular", 'tech', 'share-tech-mono-regular.ttf'],
  ['jetbrains-mono-extrabold', "JetBrains Mono ExtraBold", "JetBrains Mono ExtraBold:style=Regular", 'tech', 'jetbrains-mono-extrabold.ttf'],
  ['space-mono-bold', "Space Mono Bold", "Space Mono:style=Bold", 'tech', 'space-mono-bold.ttf'],
  ['vt323-regular', "VT323", "VT323:style=Regular", 'tech', 'vt323-regular.ttf'],
  ['lobster-regular', "Lobster", "Lobster:style=Regular", 'script', 'lobster-regular.ttf'],
  ['bangers-regular', "Bangers", "Bangers:style=Regular", 'script', 'bangers-regular.ttf'],
  ['righteous-regular', "Righteous", "Righteous:style=Regular", 'script', 'righteous-regular.ttf'],
  ['permanent-marker-regular', "Permanent Marker", "Permanent Marker:style=Regular", 'script', 'permanent-marker-regular.ttf'],
  ['dancing-script-bold', "Dancing Script Bold", "Dancing Script:style=Bold", 'script', 'dancing-script-bold.ttf'],
  ['great-vibes-regular', "Great Vibes", "Great Vibes:style=Regular", 'script', 'great-vibes-regular.ttf'],
  ['sacramento-regular', "Sacramento", "Sacramento:style=Regular", 'script', 'sacramento-regular.ttf'],
  ['caveat-brush-regular', "Caveat Brush", "Caveat Brush:style=Regular", 'script', 'caveat-brush-regular.ttf'],
  ['satisfy-regular', "Satisfy", "Satisfy:style=Regular", 'script', 'satisfy-regular.ttf'],
  ['kaushan-script-regular', "Kaushan Script", "Kaushan Script:style=Regular", 'script', 'kaushan-script-regular.ttf'],
];

export const FONT_LIST: FontDef[] = [...BUILTIN, ...FILES.map(([id, label, name, group, file]) => ({ id, label, name, group, file }))];
const custom: FontDef[] = [];

export const allFonts = (): FontDef[] => [...FONT_LIST, ...custom];
export const fontById = (id: string): FontDef => allFonts().find((f) => f.id === id) ?? FONT_LIST[0]!;

const fileCache = new Map<string, Promise<ArrayBuffer>>();
/** Files OpenSCAD needs for a font (fetched once; empty for built-in fonts). */
export async function fontFiles(id: string): Promise<Array<{ path: string; data: ArrayBuffer }>> {
  const f = fontById(id);
  if (f.data) return [{ path: `fonts/custom-${f.id}.ttf`, data: f.data.slice(0) }];
  if (!f.file) return [];
  let p = fileCache.get(f.file);
  if (!p) {
    p = fetch(`/fonts/${f.file}`).then((r) => {
      if (!r.ok) throw new Error(`Could not load the font “${f.label}” (${r.status}).`);
      return r.arrayBuffer();
    });
    p.catch(() => fileCache.delete(f.file!));
    fileCache.set(f.file, p);
  }
  return [{ path: `fonts/${f.file}`, data: (await p).slice(0) }];
}

/** Family + style names from a TTF/OTF `name` table (platform 3 or 1). */
export function parseFontNames(buf: ArrayBuffer): { family: string; style: string } | null {
  try {
    const dv = new DataView(buf);
    let base = 0;
    if (dv.getUint32(0) === 0x74746366) base = dv.getUint32(12); // .ttc: first font
    const n = dv.getUint16(base + 4);
    let off = 0;
    for (let i = 0; i < n; i++) {
      const e = base + 12 + i * 16;
      if (dv.getUint32(e) === 0x6e616d65) { off = dv.getUint32(e + 8); break; } // 'name'
    }
    if (!off) return null;
    const count = dv.getUint16(off + 2), strOff = off + dv.getUint16(off + 4);
    const got = new Map<number, string>();
    for (let i = 0; i < count; i++) {
      const r = off + 6 + i * 12;
      const plat = dv.getUint16(r), id = dv.getUint16(r + 6), len = dv.getUint16(r + 8), so = strOff + dv.getUint16(r + 10);
      if (![1, 2, 16, 17].includes(id) || (plat !== 3 && plat !== 1) || (got.has(id) && plat === 1)) continue;
      let s = '';
      if (plat === 3) for (let k = 0; k < len; k += 2) s += String.fromCharCode(dv.getUint16(so + k));
      else for (let k = 0; k < len; k++) s += String.fromCharCode(dv.getUint8(so + k));
      got.set(id, s);
    }
    const family = got.get(16) ?? got.get(1);
    return family ? { family, style: got.get(17) ?? got.get(2) ?? 'Regular' } : null;
  } catch {
    return null;
  }
}

/** Registers an uploaded font for this session; returns its id. */
export function addCustomFont(fileName: string, data: ArrayBuffer): FontDef | null {
  const names = parseFontNames(data);
  if (!names) return null;
  const id = `custom-${custom.length + 1}`;
  const def: FontDef = { id, label: `${names.family} ${names.style}`.replace(/ Regular$/, ''), name: `${names.family}:style=${names.style}`, group: 'custom', data };
  void fileName;
  custom.push(def);
  return def;
}
