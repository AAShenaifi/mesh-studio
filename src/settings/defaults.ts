import type { Unit } from './units';
import type { UpAxis } from './axes';

export interface Settings {
  gridVisible: boolean;
  /** Edge length of the square grid, in millimetres. */
  gridSize: number;
  /** Number of cells along one edge. */
  gridDivisions: number;
  gridColor: string;
  gridCenterColor: string;
  units: Unit;
  upAxis: UpAxis;
  backgroundColor: string;
  autoFitOnLoad: boolean;
  /** Snap gizmo moves to 1 mm, rotations to 15°, scale to 5 %. */
  snap: boolean;
  /** Gizmo snap steps: move (mm), rotate (degrees), scale (%). */
  snapMove: number;
  snapRotate: number;
  snapScale: number;
  /** While moving, snap the object's sides / centre to other objects' sides / centres. */
  snapToObjects: boolean;
  /** Distance (mm) within which object snapping kicks in. */
  objectSnapDistance: number;
  /** Measure tool: snap radius in screen pixels. */
  measureSnapPx: number;
  /** STEP/IGES tessellation preset. */
  stepQuality: 'draft' | 'normal' | 'fine';
  /** STEP assemblies: one object per part (true) or one merged object. */
  stepPerPart: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  gridVisible: true,
  gridSize: 400,
  gridDivisions: 40,
  gridColor: '#3a3145',
  gridCenterColor: '#8d74a6',
  units: 'mm',
  upAxis: 'z',
  backgroundColor: '#17111f',
  autoFitOnLoad: true,
  snap: false,
  snapMove: 1,
  snapRotate: 15,
  snapScale: 5,
  snapToObjects: true,
  objectSnapDistance: 2,
  measureSnapPx: 8,
  stepQuality: 'normal',
  stepPerPart: true,
};

export const LIMITS = {
  gridSize: { min: 1, max: 100_000 },
  gridDivisions: { min: 1, max: 1000 },
  snapMove: { min: 0.01, max: 1000 },
  snapRotate: { min: 0.1, max: 180 },
  snapScale: { min: 0.1, max: 100 },
  objectSnapDistance: { min: 0.01, max: 100 },
  measureSnapPx: { min: 1, max: 50 },
} as const;
