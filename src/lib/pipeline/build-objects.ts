import type { ColorRegion } from "./vectorize";
import type {
  EmbroideryObject,
  FabricProfile,
  Shape,
} from "./types";

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

function scaleShape(shapePx: Shape, mmPerPx: number): Shape {
  return {
    outer: shapePx.outer.map(([x, y]) => [x * mmPerPx, y * mmPerPx]),
    holes: [], // Cycle 4 で holes の変換を実装
  };
}

/**
 * ColorRegion[] から EmbroideryObject[] を構築する。
 * order は region.colorIndex 昇順 × region 内 shape 出現順で 0-based 連番。
 */
export function buildObjects(input: BuildObjectsInput): EmbroideryObject[] {
  const result: EmbroideryObject[] = [];
  const mmPerPx = input.widthMm / input.widthPx;
  const sorted = [...input.regions].sort((a, b) => a.colorIndex - b.colorIndex);
  let order = 0;
  for (const region of sorted) {
    region.shapes.forEach((shapePx, shapeIndex) => {
      if (shapePx.outer.length < 3) return;
      const shapeMm = scaleShape(shapePx, mmPerPx);
      result.push({
        id: `${region.colorIndex}-${shapeIndex}`,
        kind: "fill", // Cycle 3 で run/satin/fill 判定に置き換え
        colorIndex: region.colorIndex,
        rgb: region.rgb,
        shape: shapeMm,
        props: {
          densityMm: input.fabric.defaultDensityMm,
          maxStitchMm: 7,
        },
        order: order++,
      });
    });
  }
  return result;
}
