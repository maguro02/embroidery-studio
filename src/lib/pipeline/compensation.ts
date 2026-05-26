// Phase 2 計画書 §4 Pull Compensation / §5 Push Compensation。
// 純関数 API: 入力 EmbroideryObject を破壊せず、shape のみ差し替えた新オブジェクトを返す。
// 設計順序 (§4.5): underlay は元 shape、top stitches は補正後 shape に対して計算する。
// 現状は PR8 スコープ: Satin の Pull Compensation のみ。Fill / Push は PR9 で追加する。

import type {
  EmbroideryObject,
  FabricProfile,
  Point2D,
  Polygon,
  Shape,
} from "./types";
import { pullCompForWidth } from "./fabric";
import { analyzeShape } from "./geometry";

/**
 * Pull compensation を適用する。
 *
 * - `kind="run"`: 補正不要、入力をそのまま参照同一で返す
 * - `kind="satin"`: PCA 短軸方向に外側オフセット (自前 normal offset, clipper 不要)
 * - `kind="fill"`: PR9 まで未対応、参照同一で返す
 *
 * 補正量の解決優先順位:
 *   1. `props.pullCompMm`
 *   2. `props.pullCompPerSideMm` の `(left + right) / 2`
 *   3. `pullCompForWidth(fabric, shortSideMm)`
 */
export function applyPullCompensation(
  obj: EmbroideryObject,
  fabric: FabricProfile,
): EmbroideryObject {
  if (obj.kind === "run") return obj;
  if (obj.kind === "fill") {
    // TODO(PR9): Fill の outer/holes に対する polygon offset (clipper-lib 利用)
    return obj;
  }
  const amount = resolvePullAmount(obj, fabric);
  return { ...obj, shape: offsetSatinByNormal(obj.shape, amount) };
}

function resolvePullAmount(
  obj: EmbroideryObject,
  fabric: FabricProfile,
): number {
  if (obj.props.pullCompMm !== undefined) return obj.props.pullCompMm;
  if (obj.props.pullCompPerSideMm) {
    const { left, right } = obj.props.pullCompPerSideMm;
    return (left + right) / 2;
  }
  const { shortSide } = analyzeShape(obj.shape.outer);
  return pullCompForWidth(fabric, shortSide);
}

function offsetSatinByNormal(shape: Shape, amountMm: number): Shape {
  if (amountMm === 0) {
    return {
      outer: shape.outer.map(([x, y]) => [x, y] as Point2D),
      holes: shape.holes.map((h) => h.map(([x, y]) => [x, y] as Point2D)),
    };
  }
  const { longAxis, center } = analyzeShape(shape.outer);
  const shortAxis: Point2D = [-longAxis[1], longAxis[0]];
  const outer: Polygon = shape.outer.map(([x, y]) => {
    const dx = x - center[0];
    const dy = y - center[1];
    const s = dx * shortAxis[0] + dy * shortAxis[1];
    const sign = s >= 0 ? 1 : -1;
    return [
      x + shortAxis[0] * amountMm * sign,
      y + shortAxis[1] * amountMm * sign,
    ] as Point2D;
  });
  return { outer, holes: shape.holes };
}

/** テスト専用に内部ヘルパを公開する (本番コードから参照しないこと)。 */
export const __internal = {
  resolvePullAmount,
  offsetSatinByNormal,
};
