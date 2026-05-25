import type {
  StitchPattern,
  StitchBlock,
  Stitch,
  StitchKind,
  Shape,
  EmbroideryObject,
  EmbroideryDesign,
  FabricProfile,
} from "./types";
import type { ColorRegion } from "./vectorize";
import { analyzeShape, computeAspectRatio } from "./geometry";
import { buildObjects } from "./build-objects";

const SATIN_MIN_ASPECT_RATIO = 4;
const DEFAULT_MAX_STITCH_MM = 7;
const DEFAULT_TRIM_THRESHOLD_MM = 8;
const DEFAULT_RUN_MAX_WIDTH_MM = 0.6;
const DEFAULT_FILL_ANGLE_DEG = 45;
const DEFAULT_SHAPE_STRATEGY_MIN_ASPECT = 1.5;

export type StitchInput = {
  regions: ColorRegion[];
  /** 生地プロファイル。density・underlay・pull comp の派生元として buildObjects / renderDesign に流す。 */
  fabric: FabricProfile;
  widthMm: number;
  heightMm: number;
  widthPx: number;
  heightPx: number;
  stitchDensityMm: number;
  satinMaxWidthMm: number;
  runMaxWidthMm?: number;
  maxStitchMm?: number;
  /** この距離より長い jump の前に trim (糸切り) を挿入する。PES/JEF/EXP/VP3 で渡り糸を切るのに使う。 */
  trimThresholdMm?: number;
  /** 全体の fill 角度 (deg)。0 で水平、90 で垂直。 */
  fillAngleDeg?: number;
  /**
   * 色 (colorIndex) ごとの fill 角度 override (deg)。
   * 指定があれば `fillStrategy` / `fillAngleDeg` より優先される。
   * 文字色・キャラ色など、絵柄パーツごとに縫い方向を変えたいときに使う。
   */
  fillAngleByColorIndex?: Record<number, number>;
  /**
   * shape 形状に基づいた fill 方向の決め方。
   * - `global-angle`: 全 shape を `fillAngleDeg` で塗る (デフォルト)
   * - `shape-long-axis`: 各 shape の PCA 長軸に沿って塗る
   * - `shape-cross-axis`: 長軸に直交して塗る (satin と同じ感覚)
   * 等方形 (aspectRatio < `shapeStrategyMinAspect`) の shape は不安定なので
   * `fillAngleDeg` にフォールバックする。
   */
  fillStrategy?: FillStrategy;
  /**
   * `shape-long-axis` / `shape-cross-axis` で PCA 方向を採用する最小アスペクト比。
   * デフォルト 1.5。これより低い shape は `fillAngleDeg` にフォールバック。
   */
  shapeStrategyMinAspect?: number;
};

export type FillStrategy =
  | "global-angle"
  | "shape-long-axis"
  | "shape-cross-axis";

/**
 * 既存 `StitchInput` のうち renderer が必要とする「描画パラメータ」だけを残した型。
 * Phase 1 PR4 時点では `StitchInput` とほぼ等価。
 * Phase 1 PR6-8 で `ObjectProps` / `FabricProfile` ベースに置き換える予定。
 *
 * renderer の入力 obj は既に mm 座標 (shape は scaleShape 済み) なので px→mm 換算は不要。
 * よって height 系の px 値は持たない (heightMm は出力 StitchPattern に残すため保持)。
 */
export type RenderOptions = {
  widthMm: number;
  heightMm: number;
  widthPx: number;
  stitchDensityMm: number;
  satinMaxWidthMm: number;
  runMaxWidthMm?: number;
  maxStitchMm?: number;
  trimThresholdMm?: number;
  fillAngleDeg?: number;
  fillAngleByColorIndex?: Record<number, number>;
  fillStrategy?: FillStrategy;
  shapeStrategyMinAspect?: number;
};

/** 1 オブジェクトを描画するための文脈。 */
export type RenderContext = {
  opts: RenderOptions;
};

type Point = [number, number];
type Polygon = Point[];

/**
 * 1 つの kind="run" オブジェクトを描画して Stitch 配列を返す。
 * 戻り値の先頭は (prev=undefined のため) jump/trim を含まない。
 */
export function renderRun(
  obj: EmbroideryObject,
  ctx: RenderContext,
): Stitch[] {
  const block: StitchBlock = {
    colorIndex: obj.colorIndex,
    rgb: obj.rgb,
    stitches: [],
  };
  const pts = resamplePolyline(
    obj.shape.outer as Polygon,
    ctx.opts.stitchDensityMm,
  );
  if (pts.length === 0) return block.stitches;
  appendStitchesWithJumps(
    block,
    pts,
    "run",
    obj.colorIndex,
    ctx.opts.maxStitchMm ?? DEFAULT_MAX_STITCH_MM,
    ctx.opts.trimThresholdMm ?? DEFAULT_TRIM_THRESHOLD_MM,
    true,
  );
  return block.stitches;
}

/**
 * 1 つの kind="satin" オブジェクトを描画して Stitch 配列を返す。
 * 戻り値の先頭は jump/trim を含まない。
 */
export function renderSatin(
  obj: EmbroideryObject,
  ctx: RenderContext,
): Stitch[] {
  const block: StitchBlock = {
    colorIndex: obj.colorIndex,
    rgb: obj.rgb,
    stitches: [],
  };
  const outer = obj.shape.outer as Polygon;
  const { longAxis, center } = analyzeShape(outer);
  const pts = satinStitches(outer, ctx.opts.stitchDensityMm, longAxis, center);
  if (pts.length === 0) return block.stitches;
  appendStitchesWithJumps(
    block,
    pts,
    "satin",
    obj.colorIndex,
    ctx.opts.maxStitchMm ?? DEFAULT_MAX_STITCH_MM,
    ctx.opts.trimThresholdMm ?? DEFAULT_TRIM_THRESHOLD_MM,
    true,
  );
  return block.stitches;
}

/**
 * 1 つの kind="fill" オブジェクトを描画して Stitch 配列を返す。
 * scanline 行間/穴跨ぎの jump は内部で挿入されるが、戻り値の先頭は jump/trim を含まない。
 */
export function renderFill(
  obj: EmbroideryObject,
  ctx: RenderContext,
): Stitch[] {
  const block: StitchBlock = {
    colorIndex: obj.colorIndex,
    rgb: obj.rgb,
    stitches: [],
  };
  const outer = obj.shape.outer as Polygon;
  const { longAxis, center } = analyzeShape(outer);
  const aspectRatio = computeAspectRatio(outer, longAxis, center);
  const colorOverride = ctx.opts.fillAngleByColorIndex?.[obj.colorIndex];
  const shapeAngleDeg = resolveShapeFillAngle(
    colorOverride,
    ctx.opts.fillStrategy ?? "global-angle",
    ctx.opts.fillAngleDeg ?? DEFAULT_FILL_ANGLE_DEG,
    longAxis,
    aspectRatio,
    ctx.opts.shapeStrategyMinAspect ?? DEFAULT_SHAPE_STRATEGY_MIN_ASPECT,
  );
  const segments = fillStitches(
    obj.shape,
    ctx.opts.stitchDensityMm,
    shapeAngleDeg,
  );
  const maxStitchMm = ctx.opts.maxStitchMm ?? DEFAULT_MAX_STITCH_MM;
  const trimThresholdMm =
    ctx.opts.trimThresholdMm ?? DEFAULT_TRIM_THRESHOLD_MM;
  for (const seg of segments) {
    if (seg.length === 0) continue;
    appendStitchesWithJumps(
      block,
      seg,
      "fill",
      obj.colorIndex,
      maxStitchMm,
      trimThresholdMm,
      true,
    );
  }
  return block.stitches;
}

/**
 * `EmbroideryDesign` を pure に `StitchPattern` に変換する。
 * - colorIndex で objects をグルーピングし、同色は 1 block にまとめる
 * - block 内では order 昇順で renderRun/Satin/Fill にディスパッチ
 * - block 間には kind="stop" を末尾に挿入
 */
export function renderDesign(
  design: EmbroideryDesign,
  opts: RenderOptions,
): StitchPattern {
  const ctx: RenderContext = { opts };
  const trimThresholdMm =
    opts.trimThresholdMm ?? DEFAULT_TRIM_THRESHOLD_MM;

  // order の昇順で並べてから colorIndex でグルーピングする。
  // colorIndex 内の順序が order と一致するので、block 内の描画順も order に従う。
  const byColor = new Map<number, EmbroideryObject[]>();
  for (const obj of [...design.objects].sort((a, b) => a.order - b.order)) {
    const arr = byColor.get(obj.colorIndex) ?? [];
    arr.push(obj);
    byColor.set(obj.colorIndex, arr);
  }

  const blocks: StitchBlock[] = [];
  let totalStitches = 0;
  const colors = [...byColor.keys()].sort((a, b) => a - b);

  for (const c of colors) {
    const objs = byColor.get(c)!;
    const block: StitchBlock = {
      colorIndex: c,
      rgb: objs[0].rgb,
      stitches: [],
    };
    for (const obj of objs) {
      const stitches =
        obj.kind === "run"
          ? renderRun(obj, ctx)
          : obj.kind === "satin"
            ? renderSatin(obj, ctx)
            : renderFill(obj, ctx);
      appendObjectStitches(block, stitches, c, trimThresholdMm);
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

  return {
    widthMm: design.widthMm,
    heightMm: design.heightMm,
    blocks,
    totalStitches,
  };
}

/**
 * 旧 API。内部で `buildObjects` → `renderDesign` に委譲する。
 * fabric は呼び出し側 (`compose.ts`) で `config.fabric` から導出して渡す。
 * 現状の renderDesign は RenderOptions の数値パラメータで描画するため fabric の
 * 中身は `buildObjects` 経由の `EmbroideryObject.props` (underlay 等) にのみ影響するが、
 * Phase 2 で underlay rendering が入った時点で fabric が rendering 側にも届くよう
 * StitchInput.fabric を経由させておく。
 */
export function generateStitches(input: StitchInput): StitchPattern {
  const {
    regions,
    fabric,
    widthMm,
    heightMm,
    widthPx,
    heightPx,
    stitchDensityMm,
    satinMaxWidthMm,
    runMaxWidthMm = DEFAULT_RUN_MAX_WIDTH_MM,
    maxStitchMm = DEFAULT_MAX_STITCH_MM,
    trimThresholdMm = DEFAULT_TRIM_THRESHOLD_MM,
    fillAngleDeg = DEFAULT_FILL_ANGLE_DEG,
    fillAngleByColorIndex,
    fillStrategy = "global-angle",
    shapeStrategyMinAspect = DEFAULT_SHAPE_STRATEGY_MIN_ASPECT,
  } = input;

  const objects = buildObjects({
    regions,
    widthMm,
    widthPx,
    fabric,
    runMaxWidthMm,
    satinMaxWidthMm,
    satinMinAspectRatio: SATIN_MIN_ASPECT_RATIO,
  });
  const design: EmbroideryDesign = {
    widthMm,
    heightMm,
    fabric,
    objects,
  };
  const opts: RenderOptions = {
    widthMm,
    heightMm,
    widthPx,
    stitchDensityMm,
    satinMaxWidthMm,
    runMaxWidthMm,
    maxStitchMm,
    trimThresholdMm,
    fillAngleDeg,
    fillAngleByColorIndex,
    fillStrategy,
    shapeStrategyMinAspect,
  };
  return renderDesign(design, opts);
}

/**
 * renderer から返ってきた 1 オブジェクト分の Stitch[] を block 末尾に追加する。
 * block に既存 stitches があれば、前 object の last 点と新 object の先頭点との間に
 * 必ず jump (必要なら trim も) を挿入する。これは original generateStitches で
 * 「次 shape の first appendStitchesWithJumps が forceJumpAtStart=true で
 *  動いていた挙動」を bridge レベルで再現するもの。
 */
function appendObjectStitches(
  block: StitchBlock,
  stitches: Stitch[],
  colorIndex: number,
  trimThresholdMm: number,
): void {
  if (stitches.length === 0) return;
  if (block.stitches.length > 0) {
    const prev = block.stitches[block.stitches.length - 1];
    const first = stitches[0];
    const dist = distance(prev.x, prev.y, first.x, first.y);
    if (dist > trimThresholdMm) {
      block.stitches.push({
        x: prev.x,
        y: prev.y,
        kind: "trim",
        colorIndex,
      });
    }
    block.stitches.push({
      x: first.x,
      y: first.y,
      kind: "jump",
      colorIndex,
    });
  }
  block.stitches.push(...stitches);
}

function appendStitchesWithJumps(
  block: StitchBlock,
  pts: Point[],
  kind: StitchKind,
  colorIndex: number,
  maxStitchMm: number,
  trimThresholdMm: number,
  forceJumpAtStart = false,
) {
  if (pts.length === 0) return;
  const prev = block.stitches[block.stitches.length - 1];
  const dist = prev
    ? distance(prev.x, prev.y, pts[0][0], pts[0][1])
    : 0;
  const needJump =
    prev !== undefined && (forceJumpAtStart || dist > maxStitchMm);

  let lastX: number;
  let lastY: number;

  if (needJump && prev) {
    // 渡り糸が長い場合は jump 前に trim を挿入して、糸切り対応機種で確実に切る。
    // trim 自体は座標を進めず、現在位置 (prev) で「糸を切る」コマンドとして扱われる。
    if (dist > trimThresholdMm) {
      block.stitches.push({
        x: prev.x,
        y: prev.y,
        kind: "trim",
        colorIndex,
      });
    }
    // jump は pts[0] への移動そのもの。針位置を pts[0] に進める。
    block.stitches.push({
      x: pts[0][0],
      y: pts[0][1],
      kind: "jump",
      colorIndex,
    });
    // lastX/Y を pts[0] に揃えることで、ループ最初の pts[0] 処理は d=0 となり、
    // prev → pts[0] のギャップに kind 縫い目が細分化されて挿入されない。
    // 一方で pts[0] 自体は STITCH として 1 点 push されるため、JUMP 後の
    // セグメント開始点 (scanline の pa など) がアンカーとして刺繍ファイルに記録される。
    lastX = pts[0][0];
    lastY = pts[0][1];
  } else {
    lastX = prev?.x ?? pts[0][0];
    lastY = prev?.y ?? pts[0][1];
  }

  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i];
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

function resolveShapeFillAngle(
  colorOverride: number | undefined,
  strategy: FillStrategy,
  globalAngleDeg: number,
  longAxis: Point,
  aspectRatio: number,
  minAspect: number,
): number {
  if (colorOverride !== undefined) return colorOverride;
  if (strategy === "global-angle") return globalAngleDeg;
  if (aspectRatio < minAspect) return globalAngleDeg;
  const longRad = Math.atan2(longAxis[1], longAxis[0]);
  const longDeg = (longRad * 180) / Math.PI;
  return strategy === "shape-long-axis" ? longDeg : longDeg + 90;
}

function distance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.hypot(x2 - x1, y2 - y1);
}

// analyzeShape / computeAspectRatio は ./geometry に移動済み。
// __internal 経由でテストから参照されているため、re-export を維持する。

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
    const crossings = intersectScanline([polygon], ox, oy, shortAxis);
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

/**
 * 穴を抜いた fill ステッチを「セグメント配列」として返す。
 * 各セグメントは穴を跨がない 1 区間の塗り (= 2 点で表現)。
 * セグメント境界には呼び出し側で必ず jump を挿入する想定なので、
 * 穴跨ぎ部分も scanline 行間遷移もまとめて jump 扱いになる。
 */
function fillStitches(
  shape: Shape,
  densityMm: number,
  angleDeg: number,
): Point[][] {
  const rad = (angleDeg * Math.PI) / 180;
  const dir: Point = [Math.cos(rad), Math.sin(rad)];
  const perp: Point = [-dir[1], dir[0]];

  // バウンディングは外形だけで十分
  let minS = Infinity;
  let maxS = -Infinity;
  for (const [x, y] of shape.outer) {
    const s = x * perp[0] + y * perp[1];
    if (s < minS) minS = s;
    if (s > maxS) maxS = s;
  }

  const rings: Polygon[] = [shape.outer, ...shape.holes];
  const segments: Point[][] = [];
  let line = 0;
  for (let s = minS; s <= maxS; s += densityMm) {
    const ox = perp[0] * s;
    const oy = perp[1] * s;
    const crossings = intersectScanline(rings, ox, oy, dir);
    if (crossings.length < 2) continue;
    crossings.sort((a, b) => a - b);
    if (crossings.length % 2 !== 0) crossings.pop();
    if (line % 2 === 0) {
      for (let i = 0; i < crossings.length; i += 2) {
        const a = crossings[i];
        const b = crossings[i + 1];
        segments.push([
          [ox + dir[0] * a, oy + dir[1] * a],
          [ox + dir[0] * b, oy + dir[1] * b],
        ]);
      }
    } else {
      for (let i = crossings.length - 2; i >= 0; i -= 2) {
        const a = crossings[i + 1];
        const b = crossings[i];
        segments.push([
          [ox + dir[0] * a, oy + dir[1] * a],
          [ox + dir[0] * b, oy + dir[1] * b],
        ]);
      }
    }
    line++;
  }
  return segments;
}

/**
 * 複数リング (outer + holes) と、点 (ox,oy) を通り方向 dir の直線との交点を、
 * その直線上の符号付き距離として返す。
 * even-odd 塗りでは、外形と穴の交点を全部集めてソート→ペア化で穴抜き塗りになる。
 */
function intersectScanline(
  rings: Polygon[],
  ox: number,
  oy: number,
  dir: Point,
): number[] {
  const out: number[] = [];
  const nx = -dir[1];
  const ny = dir[0];
  for (const ring of rings) {
    const n = ring.length;
    for (let i = 0; i < n; i++) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[(i + 1) % n];
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
  intersectScanline,
  appendStitchesWithJumps,
  resolveShapeFillAngle,
};
