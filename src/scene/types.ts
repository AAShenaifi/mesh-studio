import type { BufferGeometry } from 'three';

export type Vec3 = [number, number, number];

/** Where an object came from; generator objects keep their source so they can be re-rendered or exported as .scad. */
export interface ObjectSource {
  kind: 'file' | 'cut' | 'boolean' | 'primitive' | 'generator' | 'extrude' | 'duplicate' | 'split' | 'repair' | 'tool';
  format?: string;
  fileName?: string;
  scad?: { code: string; defines: Record<string, string> };
  /** Generator id (catalogue entry) and current parameter values. */
  generatorId?: string;
  values?: Record<string, number | string | boolean>;
  /** Image import: original file and the settings used, so the dialog can re-tune it. */
  image?: { blob: Blob; name: string; settings: import('../features/imageImport/types').ImageSettings };
  /** INFO lines echoed by the last OpenSCAD render. */
  info?: string[];
}

/**
 * One editable object. Records are immutable: every edit creates a new record
 * (history keeps old ones). `geometry` is non-indexed, in local millimetres,
 * with its bounding-box centre at the origin.
 */
export interface SceneObject {
  id: string;
  name: string;
  geometry: BufferGeometry;
  /** Palette index per triangle (length = triangle count). */
  faceColors: Uint16Array;
  position: Vec3;
  /** Euler XYZ, radians. */
  rotation: Vec3;
  scale: Vec3;
  visible: boolean;
  source: ObjectSource;
  /** Linked copies share one mesh (geometry + colours); painting one paints all, a mesh edit unlinks that copy. */
  linkId?: string;
  /** 'negative': a cutter kept as its own part; it is subtracted from overlapping objects on export (or on Apply). */
  role?: 'negative';
}

export const triCount = (o: { geometry: BufferGeometry }) => o.geometry.getAttribute('position').count / 3;
