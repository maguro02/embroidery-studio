import type { ColorRegion } from "./vectorize";
import type {
  EmbroideryObject,
  FabricProfile,
  ObjectKind,
  Shape,
} from "./types";
import { analyzeShape, computeAspectRatio } from "./geometry";

export type BuildObjectsInput = {
  regions: ColorRegion[];
  widthMm: number;
  heightMm: number;
  widthPx: number;
  heightPx: number;
  fabric: FabricProfile;
  /** kind 判定の閾値オーバーライド。未指定なら既定値を使う */
  runMaxWidthMm?: number; // default 0.6
  /** satin 判定の最大幅。呼び出し側で必須指定する想定 */
  satinMaxWidthMm: number;
  /** satin 判定の aspect ratio 下限 (既定 4) */
  satinMinAspectRatio?: number;
};

const DEFAULT_RUN_MAX_WIDTH_MM = 0.6;
const DEFAULT_SATIN_MIN_ASPECT_RATIO = 4;
const DEFAULT_MAX_STITCH_MM = 7;

function scaleShape(shapePx: Shape, mmPerPx: number): Shape {
  return {
    outer: shapePx.outer.map(([x, y]) => [x * mmPerPx, y * mmPerPx]),
    holes: [], // Cycle 4 で holes の変換を実装
  };
}

function determineKind(
  shape: Shape,
  runMaxWidthMm: number,
  satinMaxWidthMm: number,
  satinMinAspectRatio: number,
): { kind: ObjectKind; shortSide: number; aspectRatio: number } {
  const { shortSide, longAxis, center } = analyzeShape(shape.outer);
  const aspectRatio = computeAspectRatio(shape.outer, longAxis, center);
  const hasHoles = shape.holes.length > 0;
  if (shortSide < runMaxWidthMm) return { kind: "run", shortSide, aspectRatio };
  if (!hasHoles && shortSide < satinMaxWidthMm && aspectRatio > satinMinAspectRatio) {
    return { kind: "satin", shortSide, aspectRatio };
  }
  return { kind: "fill", shortSide, aspectRatio };
}

/**
 * ColorRegion[] から EmbroideryObject[] を構築する。
 * order は region.colorIndex 昇順 × region 内 shape 出現順で 0-based 連番。
 */
export function buildObjects(input: BuildObjectsInput): EmbroideryObject[] {
  const result: EmbroideryObject[] = [];
  const mmPerPx = input.widthMm / input.widthPx;
  const runMaxWidthMm = input.runMaxWidthMm ?? DEFAULT_RUN_MAX_WIDTH_MM;
  const satinMinAspectRatio = input.satinMinAspectRatio ?? DEFAULT_SATIN_MIN_ASPECT_RATIO;
  const sorted = [...input.regions].sort((a, b) => a.colorIndex - b.colorIndex);
  let order = 0;
  for (const region of sorted) {
    region.shapes.forEach((shapePx, shapeIndex) => {
      if (shapePx.outer.length < 3) return;
      const shapeMm = scaleShape(shapePx, mmPerPx);
      const { kind } = determineKind(
        shapeMm,
        runMaxWidthMm,
        input.satinMaxWidthMm,
        satinMinAspectRatio,
      );
      result.push({
        id: `${region.colorIndex}-${shapeIndex}`,
        kind,
        colorIndex: region.colorIndex,
        rgb: region.rgb,
        shape: shapeMm,
        props: {
          densityMm: input.fabric.defaultDensityMm,
          maxStitchMm: DEFAULT_MAX_STITCH_MM,
        },
        order: order++,
      });
    });
  }
  return result;
}

export const __internal = {
  determineKind,
  scaleShape,
};
