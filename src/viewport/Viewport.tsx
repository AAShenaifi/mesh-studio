import { Canvas } from '@react-three/fiber';
import { GizmoHelper, GizmoViewport } from '@react-three/drei';
import { useSettingsStore } from '../store/useSettingsStore';
import { useSceneStore } from '../store/useSceneStore';
import { useAppStore } from '../store/useAppStore';
import { CameraControls } from './CameraControls';
import { SceneObjects } from './SceneObjects';
import { StudioLights } from './StudioLights';
import { WorkspaceGrid } from './WorkspaceGrid';
import { Gizmo } from './Gizmo';
import { viewportOverlays } from './overlays';

export function Viewport() {
  const background = useSettingsStore((s) => s.backgroundColor);
  return (
    <Canvas
      className="!absolute inset-0"
      frameloop="demand"
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
      camera={{ fov: 40, near: 0.1, far: 100_000, position: [160, -220, 160], up: [0, 0, 1] }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener('webglcontextlost', (e) => {
          e.preventDefault();
          useAppStore.getState().setNotice('The graphics context was lost (GPU reset or memory pressure). Mesh Studio will redraw when the browser restores it; your scene is safe.');
        });
        gl.domElement.addEventListener('webglcontextrestored', () => useAppStore.getState().setNotice(null));
      }}
      onPointerMissed={(e) => {
        if (e.type !== 'click' || useAppStore.getState().activeTool) return;
        useSceneStore.getState().clearSelection();
      }}
    >
      <color attach="background" args={[background]} />
      <StudioLights />
      <WorkspaceGrid />
      <SceneObjects />
      <Gizmo />
      {viewportOverlays.map((Overlay, i) => (
        <Overlay key={i} />
      ))}
      <CameraControls />
      <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
        <GizmoViewport axisColors={['#ff8a8a', '#8dde8d', '#8ab8ff']} labelColor="#0e0a13" font="600 18px Cairo, system-ui, sans-serif" />
      </GizmoHelper>
    </Canvas>
  );
}
