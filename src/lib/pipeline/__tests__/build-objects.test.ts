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

describe("buildObjects — kind 判定: fill", () => {
  it("正方形 (10mm 角) の region は kind=fill になる", () => {
    const square: ColorRegion = {
      colorIndex: 0,
      rgb: [255, 0, 0],
      svgPath: "",
      shapes: [{
        outer: [[0, 0], [100, 0], [100, 100], [0, 100]], // px 座標
        holes: [],
      }],
      polygons: [],
    };
    const result = buildObjects({
      regions: [square],
      widthMm: 10, heightMm: 10, // 1px = 0.1mm
      widthPx: 100, heightPx: 100,
      fabric: FABRIC_PROFILES.denim,
      satinMaxWidthMm: 6,
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      kind: "fill",
      colorIndex: 0,
      rgb: [255, 0, 0],
      order: 0,
    });
    // mm 座標に変換されている (10mm × 10mm の正方形)
    expect(result[0].shape.outer).toEqual([
      [0, 0], [10, 0], [10, 10], [0, 10],
    ]);
    expect(result[0].shape.holes).toEqual([]);
  });

  it("id が `${colorIndex}-${shapeIndex}` 形式で安定する", () => {
    const region: ColorRegion = {
      colorIndex: 2,
      rgb: [0, 0, 0],
      svgPath: "",
      shapes: [
        { outer: [[0, 0], [100, 0], [100, 100], [0, 100]], holes: [] },
        { outer: [[200, 200], [300, 200], [300, 300], [200, 300]], holes: [] },
      ],
      polygons: [],
    };
    const result = buildObjects({
      regions: [region],
      widthMm: 30, heightMm: 30, widthPx: 300, heightPx: 300,
      fabric: FABRIC_PROFILES.denim,
      satinMaxWidthMm: 6,
    });
    expect(result.map((o) => o.id)).toEqual(["2-0", "2-1"]);
    expect(result.map((o) => o.order)).toEqual([0, 1]);
  });
});

describe("buildObjects — kind 判定: satin / run", () => {
  it("細長い帯 (幅 0.8mm, 長さ 10mm, aspect > 4) は kind=satin", () => {
    // 100px x 8px = 10mm x 0.8mm (mmPerPx = 0.1)
    const stripe: ColorRegion = {
      colorIndex: 0, rgb: [0, 0, 0], svgPath: "",
      shapes: [{
        outer: [[0, 0], [100, 0], [100, 8], [0, 8]],
        holes: [],
      }],
      polygons: [],
    };
    const result = buildObjects({
      regions: [stripe],
      widthMm: 10, heightMm: 1, widthPx: 100, heightPx: 10,
      fabric: FABRIC_PROFILES.denim,
      satinMaxWidthMm: 6,
      satinMinAspectRatio: 4,
    });
    expect(result[0].kind).toBe("satin");
  });

  it("極細線 (幅 0.4mm < runMaxWidthMm 0.6mm) は kind=run", () => {
    // 100px x 4px → 10mm x 0.4mm
    const thin: ColorRegion = {
      colorIndex: 0, rgb: [0, 0, 0], svgPath: "",
      shapes: [{
        outer: [[0, 0], [100, 0], [100, 4], [0, 4]],
        holes: [],
      }],
      polygons: [],
    };
    const result = buildObjects({
      regions: [thin],
      widthMm: 10, heightMm: 1, widthPx: 100, heightPx: 10,
      fabric: FABRIC_PROFILES.denim,
      runMaxWidthMm: 0.6,
      satinMaxWidthMm: 6,
    });
    expect(result[0].kind).toBe("run");
  });

  it("aspect ratio が 4 以下なら satin にならず fill になる", () => {
    // 100px x 50px → 10mm x 5mm, aspect = 2
    const chubby: ColorRegion = {
      colorIndex: 0, rgb: [0, 0, 0], svgPath: "",
      shapes: [{
        outer: [[0, 0], [100, 0], [100, 50], [0, 50]],
        holes: [],
      }],
      polygons: [],
    };
    const result = buildObjects({
      regions: [chubby],
      widthMm: 10, heightMm: 5, widthPx: 100, heightPx: 50,
      fabric: FABRIC_PROFILES.denim,
      satinMaxWidthMm: 6,
      satinMinAspectRatio: 4,
    });
    expect(result[0].kind).toBe("fill");
  });
});
