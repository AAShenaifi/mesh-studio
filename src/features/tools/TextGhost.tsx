import { useEffect, useMemo, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { BufferGeometry, DoubleSide, Float32BufferAttribute, Matrix4, Quaternion, Vector3 } from 'three';
import { selectedObjects, useSceneStore } from '../../store/useSceneStore';
import { worldBox } from '../../scene/geometry';
import { flatShape, halfSize, useTextStore } from './surfaceText';
import { buildWrapTable, refineSoup, wrapStep } from './wrapTable';
import { wrapPoint } from '../../geometry/wrapLookup';

/** Last rendered preview (read by the e2e tests). */
export const ghostInfo: { verts: number; position?: number[]; scale?: number[]; conforming?: boolean; span?: number[] } = { verts: 0 };

const REF_SIZE = 10;
const REF_SVG = 20;

/** Live preview of the text/SVG in the viewport: follows the cursor, scales instantly, shows engrave (red) or emboss (green). */
export function TextGhost() {
  const t = useTextStore();
  const target = useSceneStore((s) => (s.selectedIds.length === 1 ? selectedObjects(s)[0] : undefined));
  const objects = useSceneStore((s) => s.objects);
  const [geo, setGeo] = useState<BufferGeometry | null>(null);
  const invalidate = useThree((s) => s.invalidate);
  // the viewport renders on demand: redraw whenever the preview changes or disappears
  useEffect(() => { invalidate(); });
  const svgKey = `${t.svg ? `${t.svg.name}:${t.svg.text.length}` : ''}|${t.image ? `${t.image.name}:${t.image.blob.size}` : ''}|${t.imgThreshold}|${t.imgInvert}`;

  useEffect(() => {
    if (!t.previewOn) return;
    let dead = false;
    const id = window.setTimeout(() => {
      const ref = { ...useTextStore.getState(), size: REF_SIZE, svgWidth: REF_SVG };
      if (ref.source === 'text' && !ref.text.trim()) return setGeo(null);
      if ((ref.source === 'svg' && !ref.svg) || (ref.source === 'image' && !ref.image)) return setGeo(null);
      flatShape(ref).then((m) => {
        if (dead) return;
        const g = new BufferGeometry();
        g.setAttribute('position', new Float32BufferAttribute(m.positions, 3));
        g.computeVertexNormals();
        setGeo((old) => { old?.dispose(); return g; });
      }, () => !dead && setGeo(null));
    }, 250);
    return () => { dead = true; window.clearTimeout(id); };
  }, [t.previewOn, t.source, t.text, t.font, svgKey, t.placement]);

  // On surface: the preview is bent onto the model exactly like the real engrave/emboss.
  const [conform, setConform] = useState<BufferGeometry | null>(null);
  const spot = t.placement === 'surface' ? t.hover ?? t.anchor : null;
  const spotObj = spot ? objects.find((o) => o.id === spot.objectId) : undefined;
  useEffect(() => {
    if (!t.previewOn || !spot || !spotObj) {
      setConform((old) => { old?.dispose(); return null; });
      return;
    }
    let dead = false;
    const id = window.setTimeout(() => {
      const st = useTextStore.getState();
      flatShape(st).then((m) => {
        if (dead) return;
        const [hx, hy] = halfSize(m.positions);
        const table = buildWrapTable(spotObj, st.wrap, spot.point, spot.normal, st.rotation, hx, hy);
        const emboss = st.mode === 'emboss';
        const depth = Math.max(st.depth, 0.05);
        const sink = emboss ? 0.02 : depth, top = emboss ? depth : 0.4;
        const fine = refineSoup(m.positions, wrapStep(hx, hy) * 1.5, 150_000);
        const out = new Float32Array(fine.length);
        const tmp = [0, 0, 0];
        for (let i = 0; i < fine.length; i += 3) {
          wrapPoint(table, fine[i]!, fine[i + 1]!, fine[i + 2]! * (top + sink) - sink, tmp);
          out[i] = tmp[0]!; out[i + 1] = tmp[1]!; out[i + 2] = tmp[2]!;
        }
        const g = new BufferGeometry();
        g.setAttribute('position', new Float32BufferAttribute(out, 3));
        g.computeVertexNormals();
        g.computeBoundingBox();
        setConform((old) => { old?.dispose(); return g; });
      }, () => !dead && setConform(null));
    }, t.hover ? 90 : 10);
    return () => { dead = true; window.clearTimeout(id); };
  }, [t.previewOn, spot, spotObj, t.wrap, t.rotation, t.size, t.svgWidth, t.mode, t.depth, t.source, t.text, t.font, svgKey]); // eslint-disable-line

  const place = useMemo(() => {
    let point: Vector3 | null = null;
    let normal = new Vector3(0, 0, 1);
    if (t.placement === 'top') {
      if (!target) return null;
      const box = worldBox(target);
      point = new Vector3((box.min.x + box.max.x) / 2 + t.dx, (box.min.y + box.max.y) / 2 + t.dy, box.max.z);
    } else {
      const a = t.hover ?? (t.anchor && objects.some((o) => o.id === t.anchor!.objectId) ? t.anchor : null);
      if (!a) return null;
      point = new Vector3(...a.point);
      normal = new Vector3(...a.normal).normalize();
    }
    const up = Math.abs(normal.z) > 0.999 ? new Vector3(0, 1, 0) : new Vector3(0, 0, 1);
    const right = new Vector3().crossVectors(up, normal).normalize();
    const upT = new Vector3().crossVectors(normal, right).normalize();
    const q = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(right, upT, normal));
    q.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), (t.rotation * Math.PI) / 180));
    return { point, q, normal };
  }, [t.placement, t.dx, t.dy, t.rotation, t.hover, t.anchor, target, objects]);

  if (t.previewOn && t.placement === 'surface' && conform) {
    const bb = conform.boundingBox!;
    Object.assign(ghostInfo, { verts: conform.getAttribute('position').count, position: spot?.point, scale: [1, 1, 1], conforming: true, span: [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z] });
    return (
      <mesh geometry={conform} renderOrder={20} raycast={() => {}} name="text-preview">
        <meshStandardMaterial color={t.mode === 'engrave' ? '#ff4d5e' : '#3ddc84'} emissive={t.mode === 'engrave' ? '#7a1020' : '#0e5a2e'} transparent opacity={0.85} side={DoubleSide} depthWrite={false} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </mesh>
    );
  }
  ghostInfo.conforming = false;
  if (!t.previewOn || !geo || !place) {
    ghostInfo.verts = 0;
    return null;
  }
  const k = t.source !== 'text' ? t.svgWidth / REF_SVG : t.size / REF_SIZE;
  const engrave = t.mode === 'engrave';
  const depth = Math.max(t.depth, 0.05);
  const pos = place.point.clone().addScaledVector(place.normal, engrave ? -depth : 0.01);
  Object.assign(ghostInfo, { verts: geo.getAttribute('position').count, position: pos.toArray(), scale: [k, k, engrave ? depth + 0.4 : depth] });
  return (
    <mesh geometry={geo} position={pos} quaternion={place.q} scale={[k, k, engrave ? depth + 0.4 : depth]} renderOrder={20} raycast={() => {}} name="text-preview">
      <meshStandardMaterial color={engrave ? '#ff4d5e' : '#3ddc84'} emissive={engrave ? '#7a1020' : '#0e5a2e'} transparent opacity={0.8} side={DoubleSide} depthWrite={false} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
    </mesh>
  );
}
