import type { FabricKind, FabricProfile, UnderlayConfig, UnderlayPolicy } from "./types";

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

// ---- underlay policy: family-based 実装 ----
// NOTE (Phase 1 暫定): zigzag は実機では「zigzag + edge」の合成下打ちになる。
// 本 PR では UnderlayConfig.kind="zigzag" 単独で代用し、Phase 2 で
// composite underlay (例: { kind: "composite", parts: [...] }) に拡張する。
// 同様に terry/fleece の tatami underlay は kind="fill" を密 spacing で代用する。

function satinFor_denimFamily(widthMm: number): UnderlayConfig {
  if (widthMm < 2) return { kind: "center-run", stitchLenMm: 2.0 };
  if (widthMm <= 4) return { kind: "edge-run", insetMm: 0.3, stitchLenMm: 2.0 };
  return { kind: "zigzag", spacingMm: 1.5, insetMm: 0.3 };
}

function satinFor_knitFamily(widthMm: number): UnderlayConfig {
  if (widthMm < 2) return { kind: "center-run", stitchLenMm: 1.8 };
  if (widthMm <= 4) return { kind: "edge-run", insetMm: 0.35, stitchLenMm: 1.8 };
  return { kind: "zigzag", spacingMm: 1.0, insetMm: 0.35 }; // denim より強め
}

function satinFor_terryFamily(widthMm: number): UnderlayConfig {
  if (widthMm <= 4) return { kind: "edge-run", insetMm: 0.4, stitchLenMm: 1.8 };
  return { kind: "zigzag", spacingMm: 1.2, insetMm: 0.4 };
}

function satinFor_leather(widthMm: number): UnderlayConfig {
  if (widthMm < 2) return { kind: "center-run", stitchLenMm: 2.5 };
  return { kind: "edge-run", insetMm: 0.2, stitchLenMm: 2.5 }; // zigzag 不使用
}

function satinFor_silk(widthMm: number): UnderlayConfig {
  if (widthMm < 2) return { kind: "none" };
  if (widthMm <= 4) return { kind: "center-run", stitchLenMm: 2.2 };
  return { kind: "edge-run", insetMm: 0.25, stitchLenMm: 2.2 };
}

const FILL_ANGLE_DEG = 90; // underlay fill は top stitch と直交させる前提

function fillFor_denimFamily(): UnderlayConfig {
  return { kind: "fill", angleDeg: FILL_ANGLE_DEG, spacingMm: 3.0 };
}
function fillFor_knitLight(): UnderlayConfig {
  return { kind: "fill", angleDeg: FILL_ANGLE_DEG, spacingMm: 2.5 };
}
function fillFor_knitHeavy(): UnderlayConfig {
  return { kind: "fill", angleDeg: FILL_ANGLE_DEG, spacingMm: 2.2 };
}
function fillFor_terryFamily(): UnderlayConfig {
  // Phase 1 暫定: tatami の代用として kind="fill" を密 spacing で表現
  return { kind: "fill", angleDeg: FILL_ANGLE_DEG, spacingMm: 2.0 };
}
function fillFor_leather(): UnderlayConfig {
  // 針穴跡を最小化するため fill underlay は禁止、edge-run で代用
  return { kind: "edge-run", insetMm: 0.2, stitchLenMm: 2.5 };
}
function fillFor_silkFelt(): UnderlayConfig {
  return { kind: "fill", angleDeg: FILL_ANGLE_DEG, spacingMm: 2.8 }; // 中庸
}

const runForAll = (): UnderlayConfig => ({ kind: "none" });

function underlayPolicyFor(kind: FabricKind): UnderlayPolicy {
  switch (kind) {
    case "denim":
    case "twill":
    case "canvas":
    case "felt":
      return { satin: satinFor_denimFamily, fill: fillFor_denimFamily, run: runForAll };
    case "knit-light":
      return { satin: satinFor_knitFamily, fill: fillFor_knitLight, run: runForAll };
    case "knit-heavy":
      return { satin: satinFor_knitFamily, fill: fillFor_knitHeavy, run: runForAll };
    case "terry":
    case "fleece":
      return { satin: satinFor_terryFamily, fill: fillFor_terryFamily, run: runForAll };
    case "leather":
      return { satin: satinFor_leather, fill: fillFor_leather, run: runForAll };
    case "silk":
      return { satin: satinFor_silk, fill: fillFor_silkFelt, run: runForAll };
  }
}

const FABRIC_KINDS = Object.keys(FABRIC_BASE_VALUES) as FabricKind[];

export const FABRIC_PROFILES: Readonly<Record<FabricKind, FabricProfile>> = Object.freeze(
  Object.fromEntries(
    FABRIC_KINDS.map((kind): [FabricKind, FabricProfile] => [
      kind,
      {
        kind,
        ...FABRIC_BASE_VALUES[kind],
        underlayPolicy: underlayPolicyFor(kind),
      },
    ]),
  ) as Record<FabricKind, FabricProfile>,
);

/** FabricKind から対応する FabricProfile を返す純ルックアップ。 */
export function getFabricProfile(kind: FabricKind): FabricProfile {
  return FABRIC_PROFILES[kind];
}

/**
 * satin 幅依存の pull compensation を返す。
 * 公式: max(profile.minPullCompMm, widthMm * profile.pullCompPerWidth)
 * 負数 / NaN / 非有限値は minPullCompMm にクランプ。
 */
export function pullCompForWidth(profile: FabricProfile, widthMm: number): number {
  const w = Number.isFinite(widthMm) && widthMm > 0 ? widthMm : 0;
  return Math.max(profile.minPullCompMm, w * profile.pullCompPerWidth);
}
