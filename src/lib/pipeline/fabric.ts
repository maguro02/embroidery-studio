import type { FabricKind, FabricProfile, UnderlayPolicy } from "./types";

/**
 * 生地ごとの基本パラメータ (Phase 計画書 3.3 のテーブル)。
 * underlayPolicy は本 PR の Cycle 4 で family ベースの実装に差し替える前提で、
 * Cycle 1 時点では stub (常に none を返す) を共有する。
 */
type FabricBaseValues = {
  defaultDensityMm: number;
  pullCompPerWidth: number;
  minPullCompMm: number;
  defaultPushCompMm: number;
};

const FABRIC_BASE_VALUES: Readonly<Record<FabricKind, FabricBaseValues>> = {
  denim:        { defaultDensityMm: 0.40, pullCompPerWidth: 0.025, minPullCompMm: 0.10, defaultPushCompMm: 0.05 },
  twill:        { defaultDensityMm: 0.40, pullCompPerWidth: 0.030, minPullCompMm: 0.10, defaultPushCompMm: 0.05 },
  canvas:       { defaultDensityMm: 0.42, pullCompPerWidth: 0.020, minPullCompMm: 0.10, defaultPushCompMm: 0.05 },
  "knit-light": { defaultDensityMm: 0.45, pullCompPerWidth: 0.060, minPullCompMm: 0.20, defaultPushCompMm: 0.10 },
  "knit-heavy": { defaultDensityMm: 0.48, pullCompPerWidth: 0.075, minPullCompMm: 0.25, defaultPushCompMm: 0.15 },
  terry:        { defaultDensityMm: 0.42, pullCompPerWidth: 0.080, minPullCompMm: 0.30, defaultPushCompMm: 0.20 },
  fleece:       { defaultDensityMm: 0.45, pullCompPerWidth: 0.060, minPullCompMm: 0.25, defaultPushCompMm: 0.15 },
  leather:      { defaultDensityMm: 0.50, pullCompPerWidth: 0.015, minPullCompMm: 0.05, defaultPushCompMm: 0.02 },
  silk:         { defaultDensityMm: 0.40, pullCompPerWidth: 0.020, minPullCompMm: 0.08, defaultPushCompMm: 0.03 },
  felt:         { defaultDensityMm: 0.42, pullCompPerWidth: 0.020, minPullCompMm: 0.10, defaultPushCompMm: 0.05 },
};

// Cycle 4 で family ベースの underlayPolicy 実装に置き換える。
const stubUnderlayPolicy = (): UnderlayPolicy => ({
  satin: () => ({ kind: "none" }),
  fill: () => ({ kind: "none" }),
  run: () => ({ kind: "none" }),
});

const FABRIC_KINDS = Object.keys(FABRIC_BASE_VALUES) as FabricKind[];

export const FABRIC_PROFILES: Readonly<Record<FabricKind, FabricProfile>> = Object.freeze(
  Object.fromEntries(
    FABRIC_KINDS.map((kind): [FabricKind, FabricProfile] => [
      kind,
      {
        kind,
        ...FABRIC_BASE_VALUES[kind],
        underlayPolicy: stubUnderlayPolicy(),
      },
    ]),
  ) as Record<FabricKind, FabricProfile>,
);
