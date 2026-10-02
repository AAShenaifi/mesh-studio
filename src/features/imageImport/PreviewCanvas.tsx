import { useEffect, useMemo } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { BufferAttribute, BufferGeometry, DoubleSide, Sphere, Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three/addons/controls/OrbitControls.js';
import { hexToLinear255 } from '../../scene/palette';

function Fit({ geometry }: { geometry: BufferGeometry | null }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (!geometry) return;
    geometry.computeBoundingSphere();
    const sphere = geometry.boundingSphere ?? new Sphere(new Vector3(), 10);
    const d = Math.max(sphere.radius, 1) * 2.6;
    camera.position.copy(sphere.center).add(new Vector3(0.55, -1, 0.9).normalize().multiplyScalar(d));
    camera.near = d / 100;
    camera.far = d * 100;
    camera.updateProjectionMatrix();
    controls?.target.copy(sphere.center);
    controls?.update();
    invalidate();
    // refit only when the size class changes, not on every slider step
  }, [geometry ? Math.round(Math.log2((geometry.boundingSphere?.radius ?? 1) + 1) * 4) : 0, controls]);
  return null;
}

/** Small live 3D preview of the image import result. */
export function PreviewCanvas({ positions, triColor, colors, base }: { positions: Float32Array | null; triColor: Uint8Array | null; colors: string[]; base: string }) {
  const geometry = useMemo(() => {
    if (!positions || !positions.length || !triColor) return null;
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(positions, 3));
    g.computeVertexNormals();
    const pal = [base, ...colors].map(hexToLinear255);
    const col = new Uint8Array(triColor.length * 9);
    for (let t = 0; t < triColor.length; t++) {
      const c = pal[triColor[t]!] ?? pal[0]!;
      for (let v = 0; v < 3; v++) col.set(c, t * 9 + v * 3);
    }
    g.setAttribute('color', new BufferAttribute(col, 3, true));
    g.computeBoundingSphere();
    return g;
  }, [positions, triColor, colors, base]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  return (
    <Canvas frameloop="demand" dpr={[1, 2]} camera={{ fov: 35, up: [0, 0, 1], position: [60, -100, 80] }} gl={{ antialias: true }} data-testid="image-preview-3d">
      <color attach="background" args={['#17111f']} />
      <hemisphereLight args={['#ffffff', '#2a2233', 1.4]} position={[0, 0, 1]} />
      <directionalLight intensity={1.6} position={[1, -1.5, 2.2]} />
      <directionalLight intensity={0.5} position={[-1.5, 1, 0.6]} />
      {geometry && (
        <mesh geometry={geometry}>
          <meshStandardMaterial vertexColors roughness={0.6} side={DoubleSide} />
        </mesh>
      )}
      <OrbitControls makeDefault enableDamping={false} />
      <Fit geometry={geometry} />
    </Canvas>
  );
}
