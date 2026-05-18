import { describe, it, expect } from "vitest";
import { FABRIC_PROFILES, getFabricProfile, pullCompForWidth } from "../fabric";
import type { FabricKind } from "../types";

const EXPECTED: Record<FabricKind, { density: number; pullPerWidth: number; minPull: number }> = {
  denim:        { density: 0.40, pullPerWidth: 0.025, minPull: 0.10 },
  twill:        { density: 0.40, pullPerWidth: 0.030, minPull: 0.10 },
  canvas:       { density: 0.42, pullPerWidth: 0.020, minPull: 0.10 },
  "knit-light": { density: 0.45, pullPerWidth: 0.060, minPull: 0.20 },
  "knit-heavy": { density: 0.48, pullPerWidth: 0.075, minPull: 0.25 },
  terry:        { density: 0.42, pullPerWidth: 0.080, minPull: 0.30 },
  fleece:       { density: 0.45, pullPerWidth: 0.060, minPull: 0.25 },
  leather:      { density: 0.50, pullPerWidth: 0.015, minPull: 0.05 },
  silk:         { density: 0.40, pullPerWidth: 0.020, minPull: 0.08 },
  felt:         { density: 0.42, pullPerWidth: 0.020, minPull: 0.10 },
};

const ALL_KINDS: FabricKind[] = [
  "denim", "twill", "canvas",
  "knit-light", "knit-heavy",
  "terry", "fleece", "leather", "silk", "felt",
];

describe("FABRIC_PROFILES table", () => {
  it("FABRIC_PROFILES は denim / twill / canvas / knit-light / knit-heavy / terry / fleece / leather / silk / felt の 10 種をキーに持つ", () => {
    expect(Object.keys(FABRIC_PROFILES).sort()).toEqual([...ALL_KINDS].sort());
  });

  it.each(ALL_KINDS)(
    "FABRIC_PROFILES[%s] は defaultDensityMm が Phase 計画書 3.3 の値と一致する",
    (kind) => {
      expect(FABRIC_PROFILES[kind].defaultDensityMm).toBeCloseTo(EXPECTED[kind].density, 5);
    },
  );

  it.each(ALL_KINDS)(
    "FABRIC_PROFILES[%s] は pullCompPerWidth が Phase 計画書 3.3 の値と一致する",
    (kind) => {
      expect(FABRIC_PROFILES[kind].pullCompPerWidth).toBeCloseTo(EXPECTED[kind].pullPerWidth, 5);
    },
  );

  it.each(ALL_KINDS)(
    "FABRIC_PROFILES[%s] は minPullCompMm が Phase 計画書 3.3 の値と一致する",
    (kind) => {
      expect(FABRIC_PROFILES[kind].minPullCompMm).toBeCloseTo(EXPECTED[kind].minPull, 5);
    },
  );

  it.each(ALL_KINDS)(
    "FABRIC_PROFILES[%s] は defaultPushCompMm が 0 以上 0.3 mm 以下の常識的な値",
    (kind) => {
      const v = FABRIC_PROFILES[kind].defaultPushCompMm;
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(0.3);
    },
  );

  it.each(ALL_KINDS)("FABRIC_PROFILES[%s].kind は自身のキーと一致する", (kind) => {
    expect(FABRIC_PROFILES[kind].kind).toBe(kind);
  });
});

describe("getFabricProfile", () => {
  it("getFabricProfile(\"denim\") は FABRIC_PROFILES.denim と参照同一", () => {
    expect(getFabricProfile("denim")).toBe(FABRIC_PROFILES.denim);
  });

  it("getFabricProfile(\"knit-heavy\") は kind フィールドが \"knit-heavy\"", () => {
    expect(getFabricProfile("knit-heavy").kind).toBe("knit-heavy");
  });

  it("getFabricProfile は型レベルで FabricKind 以外を受け付けない (compile-time check)", () => {
    // @ts-expect-error — 未知の kind は型エラーになるべき (ランタイム挙動はテストしない)
    getFabricProfile("unknown-fabric");
    expect(true).toBe(true);
  });
});

describe("pullCompForWidth", () => {
  const denim = FABRIC_PROFILES.denim;
  const knitHeavy = FABRIC_PROFILES["knit-heavy"];
  const terry = FABRIC_PROFILES.terry;
  const leather = FABRIC_PROFILES.leather;

  it.each<[string, number, number]>([
    ["denim, 0mm → minPull(0.10) で床打ち", 0, 0.10],
    ["denim, 2mm → 2*0.025=0.05 < 0.10 で min 側", 2, 0.10],
    ["denim, 4mm → 4*0.025=0.10 で境界", 4, 0.10],
    ["denim, 5mm → 5*0.025=0.125 で per-width 側", 5, 0.125],
  ])("pullCompForWidth(%s)", (_label, w, expected) => {
    expect(pullCompForWidth(denim, w)).toBeCloseTo(expected, 5);
  });

  it("pullCompForWidth(knit-heavy, 4) = max(0.25, 4*0.075=0.30) = 0.30", () => {
    expect(pullCompForWidth(knitHeavy, 4)).toBeCloseTo(0.30, 5);
  });

  it("pullCompForWidth(terry, 1) = max(0.30, 1*0.080=0.08) = 0.30 (min 側)", () => {
    expect(pullCompForWidth(terry, 1)).toBeCloseTo(0.30, 5);
  });

  it("pullCompForWidth(leather, 10) = max(0.05, 10*0.015=0.15) = 0.15", () => {
    expect(pullCompForWidth(leather, 10)).toBeCloseTo(0.15, 5);
  });

  it("pullCompForWidth(denim, 負数) は minPullCompMm にクランプ", () => {
    expect(pullCompForWidth(denim, -5)).toBeCloseTo(denim.minPullCompMm, 5);
  });

  it("pullCompForWidth(denim, NaN) は NaN ではなく minPullCompMm を返す", () => {
    const result = pullCompForWidth(denim, Number.NaN);
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBeCloseTo(denim.minPullCompMm, 5);
  });
});
