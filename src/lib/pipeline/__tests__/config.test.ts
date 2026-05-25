import { describe, it, expect } from "vitest";
import { applyFabricDefaults, makeDefaultConfig } from "../config";
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

describe("applyFabricDefaults", () => {
  it("未 override の状態で denim → terry に切り替えると stitchDensity が 0.42 に追従する", () => {
    const prev = makeDefaultConfig("denim");
    expect(prev.stitchDensity).toBeCloseTo(0.4);

    const next = applyFabricDefaults(prev, "terry");
    expect(next.fabric).toBe("terry");
    expect(next.stitchDensity).toBeCloseTo(0.42);
    expect(next.overrides).toEqual({});
  });

  it("fabric 以外のフィールドはそのまま維持される", () => {
    const prev = {
      ...makeDefaultConfig("denim"),
      widthMm: 200,
      colorCount: 8,
      fillAngleDeg: 30,
    };
    const next = applyFabricDefaults(prev, "knit-heavy");
    expect(next.widthMm).toBe(200);
    expect(next.colorCount).toBe(8);
    expect(next.fillAngleDeg).toBe(30);
  });

  it("同じ fabric を再指定しても idempotent (副作用なし)", () => {
    const prev = makeDefaultConfig("twill");
    const next = applyFabricDefaults(prev, "twill");
    expect(next).toEqual(prev);
  });
});
