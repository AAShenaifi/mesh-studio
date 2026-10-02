/**
 * Plain three-point studio lighting (Z-up). No environment maps or HDRs:
 * COEP require-corp would block CDN-hosted ones.
 */
export function StudioLights() {
  return (
    <>
      <hemisphereLight args={['#ffffff', '#2a2233', 1.4]} position={[0, 0, 1]} />
      <directionalLight color="#ffffff" intensity={1.8} position={[1, -1.5, 2.2]} />
      <directionalLight color="#e9e2ff" intensity={0.6} position={[-1.6, -0.6, 0.6]} />
      <directionalLight color="#ffffff" intensity={0.7} position={[-0.4, 1.8, 1.2]} />
      <ambientLight intensity={0.15} />
    </>
  );
}
