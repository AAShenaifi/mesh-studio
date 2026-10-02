import { STLLoader } from 'three/addons/loaders/STLLoader.js';

/** Binary/ASCII STL → world soup with default colour (used for OpenSCAD output). */
export function stlToSoup(buffer: ArrayBuffer): { positions: Float32Array; faceColors: Uint16Array } {
  const g = new STLLoader().parse(buffer);
  const src = g.getAttribute('position').array as Float32Array;
  const positions = new Float32Array(src);
  g.dispose();
  return { positions, faceColors: new Uint16Array(positions.length / 9) };
}

/** Soup → binary STL bytes (for passing meshes into OpenSCAD as /input.stl). */
export function soupToStl(positions: Float32Array): ArrayBuffer {
  const n = positions.length / 9;
  const buf = new ArrayBuffer(84 + n * 50);
  const dv = new DataView(buf);
  dv.setUint32(80, n, true);
  for (let t = 0; t < n; t++) for (let k = 0; k < 9; k++) dv.setFloat32(84 + t * 50 + 12 + k * 4, positions[t * 9 + k]!, true);
  return buf;
}
