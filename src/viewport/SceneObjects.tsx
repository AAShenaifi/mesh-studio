import { memo, useEffect, useMemo } from 'react';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import { BoxGeometry, DoubleSide, EdgesGeometry, LineBasicMaterial, MeshStandardMaterial, Vector3, type Mesh } from 'three';
import { useSceneStore } from '../store/useSceneStore';
import { useAppStore } from '../store/useAppStore';
import type { SceneObject } from '../scene/types';
import { boxOf, ensureBoundsTree, worldBox } from '../scene/geometry';

/** Shared overhang-shading switch: faces closer to straight down than `cos` are tinted red. */
export const overhangUniforms = { uOverhangCos: { value: 2 } };

/** Adds overhang tinting to a standard material (world normal from screen derivatives, so it follows any transform). */
function withOverhangShading(material: MeshStandardMaterial, minZ: { value: number }) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uOverhangCos = overhangUniforms.uOverhangCos;
    shader.uniforms.uMinZ = minZ;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vOhWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvOhWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vOhWorld;\nuniform float uOverhangCos;\nuniform float uMinZ;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float ohFlag = 0.0;
        if (uOverhangCos < 1.5) {
          vec3 ohN = normalize(cross(dFdx(vOhWorld), dFdy(vOhWorld)));
          if (!gl_FrontFacing) ohN = -ohN;
          if (ohN.z < -uOverhangCos && vOhWorld.z > uMinZ + 0.15) ohFlag = 1.0;
        }`,
      )
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.92, 0.16, 0.12), 0.7 * ohFlag);');
  };
}

/** Live three.js meshes by object id, for the gizmo and interactive tools. */
export const meshRegistry = new Map<string, Mesh>();

/** Tools that take over viewport clicks register a handler here. */
export type ViewportClickHandler = (e: ThreeEvent<MouseEvent>, object: SceneObject) => boolean;
export const viewportHandlers: { click: ViewportClickHandler | null; pointer: ((e: ThreeEvent<PointerEvent>, o: SceneObject, kind: 'down' | 'move' | 'up') => boolean) | null } = {
  click: null,
  pointer: null,
};

const edgeLine = new LineBasicMaterial({ color: '#2b1d38' });
const edgeCache = new WeakMap<object, EdgesGeometry>();
/** Feature edges (STL Studio "Edges"): computed once per geometry, on demand. */
function FeatureEdges({ object }: { object: SceneObject }) {
  const geometry = useMemo(() => {
    let g = edgeCache.get(object.geometry);
    if (!g) {
      g = new EdgesGeometry(object.geometry, 25);
      edgeCache.set(object.geometry, g);
      object.geometry.addEventListener('dispose', () => g!.dispose());
    }
    return g;
  }, [object.geometry]);
  return <lineSegments geometry={geometry} material={edgeLine} raycast={() => {}} />;
}

const selectionLine = new LineBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.85, depthTest: false });

/** Bounding-box outline in object space (cheap even for million-triangle meshes). */
function SelectionBox({ object }: { object: SceneObject }) {
  const geometry = useMemo(() => {
    const bb = object.geometry.boundingBox!;
    const size = bb.getSize(new Vector3()).addScalar(0.4);
    const box = new BoxGeometry(size.x, size.y, size.z);
    const edges = new EdgesGeometry(box);
    box.dispose();
    return edges;
  }, [object.geometry]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <lineSegments geometry={geometry} material={selectionLine} renderOrder={4} raycast={() => {}} />;
}

const ObjectMesh = memo(function ObjectMesh({ object, selected, interactive, edges, offset }: { object: SceneObject; selected: boolean; interactive: boolean; edges: boolean; offset?: [number, number, number] }) {
  const invalidate = useThree((s) => s.invalidate);
  const minZ = useMemo(() => ({ value: 0 }), []);
  const negative = object.role === 'negative';
  const material = useMemo(() => {
    if (negative) return new MeshStandardMaterial({ color: '#ff4d4f', transparent: true, opacity: 0.35, depthWrite: false, roughness: 0.6, side: DoubleSide });
    const m = new MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05, side: DoubleSide });
    withOverhangShading(m, minZ);
    return m;
  }, [minZ, negative]);
  useEffect(() => () => material.dispose(), [material]);
  const overhangs = useAppStore((s) => s.overhang.show);
  useEffect(() => {
    if (overhangs) minZ.value = worldBox(object).min.z;
  }, [object, overhangs, minZ]);
  useEffect(() => {
    material.emissive.set(selected ? '#2a1840' : '#000000');
    invalidate();
  }, [selected, material, invalidate]);

  useEffect(() => {
    // Build the BVH when the browser is idle so picking stays fast on big meshes.
    const id = window.setTimeout(() => ensureBoundsTree(object.geometry), 50);
    return () => window.clearTimeout(id);
  }, [object.geometry]);

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4) return; // it was an orbit drag
    e.stopPropagation();
    if (viewportHandlers.click?.(e, object)) return;
    if (useAppStore.getState().activeTool) return;
    const multi = e.shiftKey || e.ctrlKey || e.metaKey;
    useSceneStore.getState().select([object.id], multi ? 'toggle' : 'replace');
  };
  const pointer = (kind: 'down' | 'move' | 'up') => (e: ThreeEvent<PointerEvent>) => {
    if (viewportHandlers.pointer?.(e, object, kind)) e.stopPropagation();
  };

  return (
    <mesh
      ref={(m) => {
        if (!m) return;
        meshRegistry.set(object.id, m);
        return () => {
          if (meshRegistry.get(object.id) === m) meshRegistry.delete(object.id);
        };
      }}
      name={object.id}
      userData={{ objectId: object.id }}
      geometry={object.geometry}
      material={material}
      position={offset ? [object.position[0] + offset[0], object.position[1] + offset[1], object.position[2] + offset[2]] : object.position}
      rotation={object.rotation}
      scale={object.scale}
      visible={object.visible}
      onClick={onClick}
      // Hover/drag raycasts only while a tool needs them (cheap idle viewport on huge meshes).
      onPointerDown={interactive ? pointer('down') : undefined}
      onPointerMove={interactive ? pointer('move') : undefined}
      onPointerUp={interactive ? pointer('up') : undefined}
    >
      {selected && <SelectionBox object={object} />}
      {edges && object.faceColors.length <= 2_000_000 && <FeatureEdges object={object} />}
    </mesh>
  );
});

export function SceneObjects() {
  const objects = useSceneStore((s) => s.objects);
  const selectedIds = useSceneStore((s) => s.selectedIds);
  const paintVersion = useSceneStore((s) => s.paintVersion);
  const interactive = useAppStore((s) => s.activeTool !== null);
  const edges = useAppStore((s) => s.showEdges);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => invalidate(), [objects, paintVersion, invalidate]);
  const overhang = useAppStore((s) => s.overhang);
  const explode = useAppStore((s) => s.explode);
  const offsets = useMemo(() => {
    if (!explode) return null;
    const vis = objects.filter((o) => o.visible);
    if (vis.length < 2) return null;
    const c = boxOf(vis).getCenter(new Vector3());
    const size = boxOf(vis).getSize(new Vector3()).length();
    return new Map(vis.map((o) => {
      const d = worldBox(o).getCenter(new Vector3()).sub(c);
      if (d.lengthSq() < 1e-9) d.set(0, 0, 1);
      d.normalize().multiplyScalar(explode * size * 0.5);
      return [o.id, d.toArray() as [number, number, number]];
    }));
  }, [explode, objects]);
  useEffect(() => {
    overhangUniforms.uOverhangCos.value = overhang.show ? Math.cos((overhang.angle * Math.PI) / 180) : 2;
    invalidate();
  }, [overhang, invalidate]);
  return (
    <>
      {objects.map((o) => (
        <ObjectMesh key={o.id} object={o} selected={selectedIds.includes(o.id)} interactive={interactive} edges={edges} offset={offsets?.get(o.id)} />
      ))}
    </>
  );
}
