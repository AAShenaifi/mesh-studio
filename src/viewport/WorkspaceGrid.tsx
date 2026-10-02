import { useEffect, useMemo } from 'react';
import { GridHelper, type LineBasicMaterial } from 'three';
import { useSettingsStore } from '../store/useSettingsStore';

/**
 * Open workspace grid in the XY plane (no bed). Drawn first without writing
 * depth, so a model resting on it never z-fights with the lines.
 */
export function WorkspaceGrid() {
  const visible = useSettingsStore((s) => s.gridVisible);
  const size = useSettingsStore((s) => s.gridSize);
  const divisions = useSettingsStore((s) => s.gridDivisions);
  const color = useSettingsStore((s) => s.gridColor);
  const centerColor = useSettingsStore((s) => s.gridCenterColor);

  const grid = useMemo(() => {
    const g = new GridHelper(size, divisions, centerColor, color);
    (g.material as LineBasicMaterial).depthWrite = false;
    g.renderOrder = -1;
    g.rotation.x = Math.PI / 2;
    g.raycast = () => {}; // never pickable
    return g;
  }, [size, divisions, color, centerColor]);

  useEffect(() => () => {
    grid.geometry.dispose();
    (grid.material as LineBasicMaterial).dispose();
  }, [grid]);

  return <primitive object={grid} visible={visible} />;
}
