import { describe, it, expect } from "vitest";
import { FABRIC_PROFILES } from "../fabric";
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
