import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import type { Extrude2DArgs } from '../../geometry/kernelOps';

type Region = Extrude2DArgs['regions'][number];

/** SVG → regions: filled shapes keep their fill rule; stroke-only paths become thin outlines. */
export function svgToRegions(text: string): { regions: Region[]; width: number; height: number } {
  const data = new SVGLoader().parse(text);
  const regions: Region[] = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const track = (pts: Array<[number, number]>) => {
    for (const [x, y] of pts) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  };
  for (const path of data.paths) {
    const style = (path.userData?.style ?? {}) as { fill?: string; stroke?: string; strokeWidth?: number; fillRule?: string };
    const filled = style.fill !== undefined && style.fill !== 'none' && style.fill !== 'transparent';
    if (filled) {
      for (const sub of path.subPaths) {
        const pts = sub.getPoints(12).map((p) => [p.x, p.y] as [number, number]);
        if (pts.length >= 3) track(pts);
      }
      const contours = path.subPaths.map((sp) => sp.getPoints(12).map((p) => [p.x, p.y] as [number, number])).filter((c) => c.length >= 3);
      if (contours.length) regions.push({ contours, fillRule: style.fillRule === 'evenodd' ? 'EvenOdd' : 'NonZero' });
    }
    const stroked = style.stroke !== undefined && style.stroke !== 'none' && (style.strokeWidth ?? 1) > 0;
    if (stroked && !filled) {
      const w = Math.max(style.strokeWidth ?? 1, 0.01) / 2;
      for (const sub of path.subPaths) {
        const pts = sub.getPoints(12).map((p) => [p.x, p.y] as [number, number]);
        // each segment becomes a quad (outlines are unioned in the kernel)
        for (let i = 0; i < pts.length - 1; i++) {
          const [x1, y1] = pts[i]!, [x2, y2] = pts[i + 1]!;
          const dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy);
          if (l < 1e-9) continue;
          const nx = (-dy / l) * w, ny = (dx / l) * w;
          const quad: Array<[number, number]> = [[x1 + nx, y1 + ny], [x2 + nx, y2 + ny], [x2 - nx, y2 - ny], [x1 - nx, y1 - ny]];
          track(quad);
          regions.push({ contours: [quad], fillRule: 'EvenOdd' });
          // round joints/caps at both ends (included in the measured size)
          for (const [cx, cy] of i === 0 ? [[x1, y1], [x2, y2]] : [[x2, y2]]) {
            const joint: Array<[number, number]> = [];
            for (let k = 0; k < 16; k++) joint.push([cx! + Math.cos((k / 16) * Math.PI * 2) * w, cy! + Math.sin((k / 16) * Math.PI * 2) * w]);
            track(joint);
            regions.push({ contours: [joint], fillRule: 'EvenOdd' });
          }
        }
      }
    }
  }
  if (!regions.length) throw new Error('This SVG has no filled shapes or strokes to extrude.');
  return { regions, width: maxX - minX, height: maxY - minY };
}
