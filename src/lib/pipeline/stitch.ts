import type { StitchPattern, StitchBlock, Stitch, StitchKind } from "./types";
import type { ColorRegion } from "./vectorize";

export type StitchInput = {
  regions: ColorRegion[];
  widthMm: number;
  heightMm: number;
  widthPx: number;
  heightPx: number;
  stitchDensityMm: number;
  satinMaxWidthMm: number;
  runMaxWidthMm?: number;
  maxStitchMm?: number;
  fillAngleDeg?: number;
};

type Point = [number, number];
type Polygon = Point[];

export function generateStitches(input: StitchInput): StitchPattern {
  const {
    regions,
    widthMm,
    heightMm,
    widthPx,
    heightPx,
    stitchDensityMm,
    satinMaxWidthMm,
    runMaxWidthMm = 0.6,
    maxStitchMm = 7,
    fillAngleDeg = 45,
  } = input;

  void heightPx;
  const mmPerPx = widthMm / widthPx;

  const sorted = [...regions].sort((a, b) => a.colorIndex - b.colorIndex);
  const blocks: StitchBlock[] = [];
  let totalStitches = 0;

  for (const region of sorted) {
    const block: StitchBlock = {
      colorIndex: region.colorIndex,
      rgb: region.rgb,
      stitches: [],
    };

    for (const polyPx of region.polygons) {
      if (polyPx.length < 3) continue;
      const polyMm: Polygon = polyPx.map(([x, y]) => [x * mmPerPx, y * mmPerPx]);

      const { shortSide, longAxis, center } = analyzeShape(polyMm);
      const aspectRatio = computeAspectRatio(polyMm, longAxis, center);

      let kind: StitchKind;
      let pts: Point[];

      if (shortSide < runMaxWidthMm) {
        kind = "run";
        pts = resamplePolyline(polyMm, stitchDensityMm);
      } else if (shortSide < satinMaxWidthMm && aspectRatio > 4) {
        kind = "satin";
        pts = satinStitches(polyMm, stitchDensityMm, longAxis, center);
      } else {
        kind = "fill";
        pts = fillStitches(polyMm, stitchDensityMm, fillAngleDeg);
      }

      if (pts.length === 0) continue;

      appendStitchesWithJumps(
        block,
        pts,
        kind,
        region.colorIndex,
        maxStitchMm,
      );
    }

    if (block.stitches.length > 0) {
      blocks.push(block);
      totalStitches += block.stitches.filter(
        (s) => s.kind === "run" || s.kind === "satin" || s.kind === "fill",
      ).length;
    }
  }

  for (let i = 1; i < blocks.length; i++) {
    const prev = blocks[i - 1];
    prev.stitches.push({
      x: prev.stitches[prev.stitches.length - 1]?.x ?? 0,
      y: prev.stitches[prev.stitches.length - 1]?.y ?? 0,
      kind: "stop",
      colorIndex: prev.colorIndex,
    });
  }

  return { widthMm, heightMm, blocks, totalStitches };
}

function appendStitchesWithJumps(
  block: StitchBlock,
  pts: Point[],
  kind: StitchKind,
  colorIndex: number,
  maxStitchMm: number,
) {
  const prev = block.stitches[block.stitches.length - 1];
  if (prev && distance(prev.x, prev.y, pts[0][0], pts[0][1]) > maxStitchMm) {
    block.stitches.push({
      x: pts[0][0],
      y: pts[0][1],
      kind: "jump",
      colorIndex,
    });
  }
  let lastX = prev?.x ?? pts[0][0];
  let lastY = prev?.y ?? pts[0][1];
  for (const [x, y] of pts) {
    const d = distance(lastX, lastY, x, y);
    if (d > maxStitchMm) {
      const segs = Math.ceil(d / maxStitchMm);
      for (let s = 1; s <= segs; s++) {
        const t = s / segs;
        const ix = lastX + (x - lastX) * t;
        const iy = lastY + (y - lastY) * t;
        block.stitches.push({ x: ix, y: iy, kind, colorIndex });
      }
    } else {
      block.stitches.push({ x, y, kind, colorIndex });
    }
    lastX = x;
    lastY = y;
  }
}

function distance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.hypot(x2 - x1, y2 - y1);
}

/** PCA で主成分軸を求め、ポリゴンの短辺長を返す */
function analyzeShape(polygon: Polygon): {
  shortSide: number;
  longAxis: Point;
  center: Point;
} {
  const n = polygon.length;
  let cx = 0;
  let cy = 0;
  for (const [x, y] of polygon) {
    cx += x;
    cy += y;
  }
  cx /= n;
  cy /= n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const [x, y] of polygon) {
    const dx = x - cx;
    const dy = y - cy;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  sxx /= n;
  syy /= n;
  sxy /= n;

  const tr = sxx + syy;
  const det = sxx * syy - sxy * sxy;
  const disc = Math.max(0, (tr * tr) / 4 - det);
  const sqd = Math.sqrt(disc);
  const lambda1 = tr / 2 + sqd;
  const lambda2 = tr / 2 - sqd;

  let vx: number;
  let vy: number;
  if (Math.abs(sxy) > 1e-9) {
    vx = lambda1 - syy;
    vy = sxy;
  } else if (sxx >= syy) {
    vx = 1;
    vy = 0;
  } else {
    vx = 0;
    vy = 1;
  }
  const mag = Math.hypot(vx, vy) || 1;
  const longAxis: Point = [vx / mag, vy / mag];

  let minS = Infinity;
  let maxS = -Infinity;
  const shortAxis: Point = [-longAxis[1], longAxis[0]];
  for (const [x, y] of polygon) {
    const s = (x - cx) * shortAxis[0] + (y - cy) * shortAxis[1];
    if (s < minS) minS = s;
    if (s > maxS) maxS = s;
  }
  const shortSide = maxS - minS;
  void lambda2;
  return { shortSide, longAxis, center: [cx, cy] };
}

function computeAspectRatio(
  polygon: Polygon,
  longAxis: Point,
  center: Point,
): number {
  let minL = Infinity;
  let maxL = -Infinity;
  let minS = Infinity;
  let maxS = -Infinity;
  const shortAxis: Point = [-longAxis[1], longAxis[0]];
  for (const [x, y] of polygon) {
    const dx = x - center[0];
    const dy = y - center[1];
    const l = dx * longAxis[0] + dy * longAxis[1];
    const s = dx * shortAxis[0] + dy * shortAxis[1];
    if (l < minL) minL = l;
    if (l > maxL) maxL = l;
    if (s < minS) minS = s;
    if (s > maxS) maxS = s;
  }
  const longSide = maxL - minL;
  const shortSide = maxS - minS;
  if (shortSide < 1e-9) return Infinity;
  return longSide / shortSide;
}

export function resamplePolyline(polyline: Polygon, densityMm: number): Point[] {
  if (polyline.length === 0) return [];
  const closed = polyline.concat([polyline[0]]);
  const out: Point[] = [closed[0]];
  let acc = 0;
  for (let i = 1; i < closed.length; i++) {
    const [x0, y0] = closed[i - 1];
    const [x1, y1] = closed[i];
    const segLen = Math.hypot(x1 - x0, y1 - y0);
    if (segLen === 0) continue;
    let remaining = segLen;
    let cx = x0;
    let cy = y0;
    while (acc + remaining >= densityMm) {
      const t = (densityMm - acc) / remaining;
      cx = cx + (x1 - cx) * t;
      cy = cy + (y1 - cy) * t;
      out.push([cx, cy]);
      remaining = Math.hypot(x1 - cx, y1 - cy);
      acc = 0;
    }
    acc += remaining;
  }
  return out;
}

function satinStitches(
  polygon: Polygon,
  densityMm: number,
  longAxis: Point,
  center: Point,
): Point[] {
  const shortAxis: Point = [-longAxis[1], longAxis[0]];
  let minL = Infinity;
  let maxL = -Infinity;
  for (const [x, y] of polygon) {
    const l = (x - center[0]) * longAxis[0] + (y - center[1]) * longAxis[1];
    if (l < minL) minL = l;
    if (l > maxL) maxL = l;
  }

  const out: Point[] = [];
  const steps = Math.max(2, Math.ceil((maxL - minL) / densityMm));
  let side = 0;
  for (let i = 0; i <= steps; i++) {
    const l = minL + ((maxL - minL) * i) / steps;
    const ox = center[0] + longAxis[0] * l;
    const oy = center[1] + longAxis[1] * l;
    const crossings = intersectScanline(polygon, ox, oy, shortAxis);
    if (crossings.length < 2) continue;
    crossings.sort((a, b) => a - b);
    const a = crossings[0];
    const b = crossings[crossings.length - 1];
    const pa: Point = [ox + shortAxis[0] * a, oy + shortAxis[1] * a];
    const pb: Point = [ox + shortAxis[0] * b, oy + shortAxis[1] * b];
    if (side === 0) {
      out.push(pa, pb);
      side = 1;
    } else {
      out.push(pb, pa);
      side = 0;
    }
  }
  return out;
}

function fillStitches(
  polygon: Polygon,
  densityMm: number,
  angleDeg: number,
): Point[] {
  const rad = (angleDeg * Math.PI) / 180;
  const dir: Point = [Math.cos(rad), Math.sin(rad)];
  const perp: Point = [-dir[1], dir[0]];

  let minS = Infinity;
  let maxS = -Infinity;
  for (const [x, y] of polygon) {
    const s = x * perp[0] + y * perp[1];
    if (s < minS) minS = s;
    if (s > maxS) maxS = s;
  }

  const out: Point[] = [];
  let line = 0;
  for (let s = minS; s <= maxS; s += densityMm) {
    const ox = perp[0] * s;
    const oy = perp[1] * s;
    const crossings = intersectScanline(polygon, ox, oy, dir);
    if (crossings.length < 2) continue;
    crossings.sort((a, b) => a - b);
    if (crossings.length % 2 !== 0) crossings.pop();
    if (line % 2 === 0) {
      for (let i = 0; i < crossings.length; i += 2) {
        const a = crossings[i];
        const b = crossings[i + 1];
        out.push([ox + dir[0] * a, oy + dir[1] * a]);
        out.push([ox + dir[0] * b, oy + dir[1] * b]);
      }
    } else {
      for (let i = crossings.length - 2; i >= 0; i -= 2) {
        const a = crossings[i + 1];
        const b = crossings[i];
        out.push([ox + dir[0] * a, oy + dir[1] * a]);
        out.push([ox + dir[0] * b, oy + dir[1] * b]);
      }
    }
    line++;
  }
  return out;
}

/** ポリゴンと、点 (ox,oy) を通り方向 dir の直線との交点を、その直線上の符号付き距離として返す */
function intersectScanline(
  polygon: Polygon,
  ox: number,
  oy: number,
  dir: Point,
): number[] {
  const out: number[] = [];
  const n = polygon.length;
  const nx = -dir[1];
  const ny = dir[0];
  for (let i = 0; i < n; i++) {
    const [x1, y1] = polygon[i];
    const [x2, y2] = polygon[(i + 1) % n];
    const s1 = (x1 - ox) * nx + (y1 - oy) * ny;
    const s2 = (x2 - ox) * nx + (y2 - oy) * ny;
    if ((s1 > 0 && s2 > 0) || (s1 < 0 && s2 < 0)) continue;
    if (s1 === s2) continue;
    const t = s1 / (s1 - s2);
    const ix = x1 + (x2 - x1) * t;
    const iy = y1 + (y2 - y1) * t;
    const d = (ix - ox) * dir[0] + (iy - oy) * dir[1];
    out.push(d);
  }
  return out;
}

/** Stitch を作るユーティリティ (テスト用) */
export function makeStitch(
  x: number,
  y: number,
  kind: StitchKind,
  colorIndex: number,
): Stitch {
  return { x, y, kind, colorIndex };
}

/** PCA 結果を test 用に export */
export const __internal = {
  analyzeShape,
  computeAspectRatio,
  fillStitches,
  satinStitches,
};
