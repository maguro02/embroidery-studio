import { describe, it, expect } from "vitest";
import { buildObjects } from "../build-objects";
import { FABRIC_PROFILES } from "../fabric";
import type { ColorRegion } from "../vectorize";

describe("buildObjects — 基本", () => {
  it("regions が空なら空配列を返す", () => {
    const result = buildObjects({
      regions: [],
      widthMm: 100,
      heightMm: 100,
      widthPx: 1000,
      heightPx: 1000,
      fabric: FABRIC_PROFILES.denim,
      satinMaxWidthMm: 6,
    });
    expect(result).toEqual([]);
  });

  it("shape.outer が 3 点未満の region は無視される", () => {
    const region: ColorRegion = {
      colorIndex: 0,
      rgb: [0, 0, 0],
      svgPath: "",
      shapes: [{ outer: [[0, 0], [1, 1]], holes: [] }],
      polygons: [],
    };
    const result = buildObjects({
      regions: [region],
      widthMm: 100,
      heightMm: 100,
      widthPx: 100,
      heightPx: 100,
      fabric: FABRIC_PROFILES.denim,
      satinMaxWidthMm: 6,
    });
    expect(result).toEqual([]);
  });
});
