import { create } from 'zustand';
import { Quaternion, Vector3 } from 'three';
import type { ConnectorArgs } from '../../geometry/kernelCore';
import { CONNECTOR_DEFAULTS, CUT_TOLERANCE } from '../../ported/cut/connectors';

export interface GrooveSettings {
  depth: number;
  width: number;
  /** Degrees. */
  flapsAngle: number;
  /** Degrees, turn of the groove about the plane normal. */
  angle: number;
  depthTolerance: number;
  widthTolerance: number;
}

export interface CutState {
  /** Plane centre (world) and orientation; the plane normal is the rotated +Z. */
  position: [number, number, number];
  quaternion: [number, number, number, number];
  gizmo: 'translate' | 'rotate';
  mode: 'plane' | 'dovetail';
  /** Plane mode: cut into this many equal slabs (1 = a single cut at the plane). */
  slabs: number;
  /** Drawing a cut line on screen. */
  drawing: boolean;
  gap: number;
  layFlat: boolean;
  /** Which halves to keep. */
  keep: 'both' | 'upper' | 'lower';
  connectors: ConnectorArgs;
  groove: GrooveSettings;
  set: (patch: Partial<Omit<CutState, 'set'>>) => void;
  setConnectors: (patch: Partial<ConnectorArgs>) => void;
}

export const useCutStore = create<CutState>()((set) => ({
  position: [0, 0, 0],
  quaternion: [0, 0, 0, 1],
  gizmo: 'translate',
  mode: 'plane',
  slabs: 1,
  drawing: false,
  gap: 0,
  layFlat: false,
  keep: 'both',
  connectors: {
    type: 'none',
    style: CONNECTOR_DEFAULTS.style,
    shape: CONNECTOR_DEFAULTS.shape,
    size: 4,
    depth: 5,
    sizeTolerance: 0.15,
    depthTolerance: CONNECTOR_DEFAULTS.depthTolerance,
    rotation: 0,
    placement: 'auto2',
    points: [],
    makeDowels: true,
  },
  groove: { depth: 3, width: 12, flapsAngle: 60, angle: 0, depthTolerance: CUT_TOLERANCE, widthTolerance: CUT_TOLERANCE },
  set: (patch) => set(patch),
  setConnectors: (patch) => set((s) => ({ connectors: { ...s.connectors, ...patch } })),
}));

export function cutNormal(s: Pick<CutState, 'quaternion'>): Vector3 {
  return new Vector3(0, 0, 1).applyQuaternion(new Quaternion(...s.quaternion)).normalize();
}

/** Quaternion that turns +Z into `axis`. */
export function quatFor(axis: Vector3): [number, number, number, number] {
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), axis.clone().normalize());
  return [q.x, q.y, q.z, q.w];
}
