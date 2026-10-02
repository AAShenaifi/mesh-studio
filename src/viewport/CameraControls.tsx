import { useEffect, useLayoutEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, Sphere, Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { useAppStore, type ViewPreset } from '../store/useAppStore';
import { selectedObjects, useSceneStore } from '../store/useSceneStore';
import { boxOf } from '../scene/geometry';

const EMPTY_RADIUS = 120;

const DIRECTIONS: Record<Exclude<ViewPreset, 'fit'>, [number, number, number]> = {
  iso: [0.75, -1, 0.8],
  front: [0, -1, 0],
  back: [0, 1, 0],
  right: [1, 0, 0],
  left: [-1, 0, 0],
  // A hair of tilt keeps OrbitControls away from its pole singularity.
  top: [0, -1e-4, 1],
  bottom: [0, -1e-4, -1],
};

/** Z-up orbit controls plus camera framing driven by `cameraRequest`. */
export function CameraControls() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const domElement = useThree((s) => s.gl.domElement);
  const setThree = useThree((s) => s.set);
  const invalidate = useThree((s) => s.invalidate);
  const size = useThree((s) => s.size);
  const cameraRequest = useAppStore((s) => s.cameraRequest);
  const [controls, setControls] = useState<OrbitControls | null>(null);

  useLayoutEffect(() => {
    camera.up.set(0, 0, 1);
    const c = new OrbitControls(camera, domElement);
    c.enableDamping = true;
    c.dampingFactor = 0.12;
    c.screenSpacePanning = true;
    const onChange = () => invalidate();
    c.addEventListener('change', onChange);
    setControls(c);
    setThree({ controls: c });
    return () => {
      c.removeEventListener('change', onChange);
      c.dispose();
      setThree({ controls: null });
    };
  }, [camera, domElement, invalidate, setThree]);

  useFrame(() => controls?.update());

  useEffect(() => {
    if (!controls) return;
    const scene = useSceneStore.getState();
    const visible = scene.objects.filter((o) => o.visible);
    const pool = cameraRequest.target === 'selection' ? selectedObjects(scene).filter((o) => o.visible) : visible;
    const objs = pool.length ? pool : visible;
    const sphere = new Sphere(new Vector3(), EMPTY_RADIUS);
    if (objs.length) {
      const box = boxOf(objs);
      box.getCenter(sphere.center);
      sphere.radius = Math.max(box.min.distanceTo(box.max) / 2, 0.5);
    }
    const vFov = (camera.fov * Math.PI) / 180;
    const aspect = size.width / Math.max(size.height, 1);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const distance = (sphere.radius / Math.sin(Math.min(vFov, hFov) / 2)) * 1.1;
    const dir =
      cameraRequest.view === 'fit'
        ? camera.position.clone().sub(controls.target).normalize()
        : new Vector3(...DIRECTIONS[cameraRequest.view]).normalize();
    if (dir.lengthSq() === 0) dir.set(...DIRECTIONS.iso).normalize();
    camera.position.copy(sphere.center).addScaledVector(dir, distance);
    camera.near = Math.max(distance / 1000, 0.01);
    camera.far = distance * 1000;
    camera.updateProjectionMatrix();
    controls.target.copy(sphere.center);
    controls.update();
    invalidate();
  }, [cameraRequest, controls]);

  return null;
}
