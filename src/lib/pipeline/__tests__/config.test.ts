import { describe, it, expect } from "vitest";
import { makeDefaultConfig } from "../config";
import { FABRIC_PROFILES } from "../fabric";

describe("makeDefaultConfig", () => {
  it("denim を渡すと fabric='denim' で stitchDensity=0.4 になる", () => {
    const cfg = makeDefaultConfig("denim");
    expect(cfg.fabric).toBe("denim");
    expect(cfg.stitchDensity).toBe(FABRIC_PROFILES.denim.defaultDensityMm);
    expect(cfg.stitchDensity).toBeCloseTo(0.4);
    expect(cfg.overrides).toEqual({});
  });

  it("terry を渡すと stitchDensity=0.42 になる", () => {
    const cfg = makeDefaultConfig("terry");
    expect(cfg.fabric).toBe("terry");
    expect(cfg.stitchDensity).toBeCloseTo(0.42);
  });

  it("既存フィールド (widthMm, colorCount, format 等) は従来のデフォルトを保つ", () => {
    const cfg = makeDefaultConfig("denim");
    expect(cfg.format).toBe("dst");
    expect(cfg.widthMm).toBe(100);
    expect(cfg.colorCount).toBe(6);
    expect(cfg.satinMaxWidthMm).toBe(5);
    expect(cfg.smoothing).toBe(2);
    expect(cfg.boundaryDilatePx).toBe(1);
    expect(cfg.fillAngleDeg).toBe(45);
    expect(cfg.fillAngleByColor).toEqual({});
    expect(cfg.fillStrategy).toBe("global-angle");
  });
});
