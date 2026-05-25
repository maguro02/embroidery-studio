import type { FabricKind } from "./types";
import { FABRIC_PROFILES } from "./fabric";
import type { ConversionConfig } from "@/components/embroidery-studio";

/** fabric によって既定値が変わるフィールド名。 */
export type FabricOverrideKey = "stitchDensity";

/** fabric を指定して初期 ConversionConfig を作る。 */
export function makeDefaultConfig(fabric: FabricKind): ConversionConfig {
  return {
    format: "dst",
    fabric,
    widthMm: 100,
    colorCount: 6,
    stitchDensity: FABRIC_PROFILES[fabric].defaultDensityMm,
    satinMaxWidthMm: 5,
    smoothing: 2,
    boundaryDilatePx: 1,
    fillAngleDeg: 45,
    fillAngleByColor: {},
    fillStrategy: "global-angle",
    overrides: {},
  };
}

/**
 * fabric 切替時に、ユーザーが触っていない fabric-driven フィールドだけを
 * 新しい fabric の既定値に差し替えた config を返す。
 * overrides に key が立っているフィールドは保持される。
 */
export function applyFabricDefaults(
  prev: ConversionConfig,
  nextFabric: FabricKind,
): ConversionConfig {
  const profile = FABRIC_PROFILES[nextFabric];
  const stitchDensity = prev.overrides.stitchDensity
    ? prev.stitchDensity
    : profile.defaultDensityMm;
  return {
    ...prev,
    fabric: nextFabric,
    stitchDensity,
  };
}
