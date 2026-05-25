import type { ColorRegion } from "./vectorize";
import type { EmbroideryObject, FabricProfile } from "./types";

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

/**
 * ColorRegion[] から EmbroideryObject[] を構築する。
 * order は region.colorIndex 昇順 × region 内 shape 出現順で 0-based 連番。
 */
export function buildObjects(input: BuildObjectsInput): EmbroideryObject[] {
  const result: EmbroideryObject[] = [];
  const sorted = [...input.regions].sort((a, b) => a.colorIndex - b.colorIndex);
  for (const region of sorted) {
    for (const shapePx of region.shapes) {
      if (shapePx.outer.length < 3) continue;
      // TODO Cycle 2 以降で EmbroideryObject を組み立てる
    }
  }
  return result;
}
