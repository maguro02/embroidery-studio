import { describe, it, expect } from "vitest";
import {
  __internal,
  centerRunUnderlay,
  edgeRunUnderlay,
} from "../underlay";
import type { Shape } from "../types";

describe("edgeRunUnderlay (rectangle, no hole)", () => {
  const square10: Shape = {
    outer: [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ],
    holes: [],
  };

  it("10mm 正方形に対して 1 本の閉ループ polyline を返す", () => {
    const rings = edgeRunUnderlay(square10, 0.4, 2.5);
    expect(rings).toHaveLength(1);
    expect(rings[0].length).toBeGreaterThanOrEqual(4);
  });

  it("各点は外形から insetMm だけ内側にある (±0.1mm)", () => {
    const rings = edgeRunUnderlay(square10, 0.4, 2.5);
    for (const [x, y] of rings[0]) {
      expect(x).toBeGreaterThanOrEqual(0.4 - 0.05);
      expect(x).toBeLessThanOrEqual(9.6 + 0.05);
      expect(y).toBeGreaterThanOrEqual(0.4 - 0.05);
      expect(y).toBeLessThanOrEqual(9.6 + 0.05);
      const d = Math.min(
        Math.abs(x - 0.4),
        Math.abs(x - 9.6),
        Math.abs(y - 0.4),
        Math.abs(y - 9.6),
      );
      expect(d).toBeLessThanOrEqual(0.1);
    }
  });

  it("隣接点間距離は stitchLenMm 以下 (90° 角での corner cut を許容)", () => {
    // 90° 角の corner cut では Euclidean = 直線歩行距離/√2 まで縮みうるため、
    // 物理ステッチ長を表す **上限**側のみ strict にチェックする。下限は ≥ stitch/√2 程度。
    const rings = edgeRunUnderlay(square10, 0.4, 2.5);
    const ring = rings[0];
    for (let i = 1; i < ring.length; i++) {
      const d = Math.hypot(
        ring[i][0] - ring[i - 1][0],
        ring[i][1] - ring[i - 1][1],
      );
      expect(d).toBeGreaterThanOrEqual(2.5 / Math.SQRT2 - 0.05);
      expect(d).toBeLessThanOrEqual(2.5 * 1.05);
    }
  });
});

describe("edgeRunUnderlay (rectangle with hole)", () => {
  const ringShape: Shape = {
    outer: [
      [0, 0],
      [20, 0],
      [20, 20],
      [0, 20],
    ],
    holes: [
      [
        [6, 6],
        [14, 6],
        [14, 14],
        [6, 14],
      ],
    ],
  };

  it("外形リング + 穴リングの計 2 本を返す", () => {
    const rings = edgeRunUnderlay(ringShape, 0.4, 2.5);
    expect(rings).toHaveLength(2);
    expect(rings[0].length).toBeGreaterThanOrEqual(4);
    expect(rings[1].length).toBeGreaterThanOrEqual(4);
  });

  it("穴リングは穴を insetMm だけ外側に膨らませたリング ([5.6..14.4] bbox)", () => {
    // outer と hole は中心が同じ (10,10) で重心では区別不能なので、
    // 「より小さい bbox 範囲のリング」= 穴リング、で識別する。
    const rings = edgeRunUnderlay(ringShape, 0.4, 2.5);
    function bboxSpan(r: [number, number][]): number {
      let lo = Infinity,
        hi = -Infinity;
      for (const [x] of r) {
        if (x < lo) lo = x;
        if (x > hi) hi = x;
      }
      return hi - lo;
    }
    const sorted = [...rings].sort((a, b) => bboxSpan(a) - bboxSpan(b));
    const holeRing = sorted[0];
    expect(bboxSpan(holeRing)).toBeLessThan(12); // 穴 bbox span ≒ 8.8
    for (const [x, y] of holeRing) {
      expect(x).toBeGreaterThanOrEqual(5.6 - 0.1);
      expect(x).toBeLessThanOrEqual(14.4 + 0.1);
      expect(y).toBeGreaterThanOrEqual(5.6 - 0.1);
      expect(y).toBeLessThanOrEqual(14.4 + 0.1);
    }
  });
});

describe("centerRunUnderlay (thin rectangle)", () => {
  const thinBar: Shape = {
    outer: [
      [0, 0],
      [20, 0],
      [20, 2],
      [0, 2],
    ],
    holes: [],
  };

  it("細長矩形の中央線 (y ≒ 1.0, ±0.3mm) を返す", () => {
    const line = centerRunUnderlay(thinBar, 2.5);
    expect(line.length).toBeGreaterThanOrEqual(6);
    expect(line.length).toBeLessThanOrEqual(12);
    for (const [, y] of line) {
      expect(y).toBeGreaterThanOrEqual(1.0 - 0.3);
      expect(y).toBeLessThanOrEqual(1.0 + 0.3);
    }
    const xs = line.map(([x]) => x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThanOrEqual(15);
  });

  it("隣接点間距離は stitchLenMm の ±20% 以内", () => {
    const line = centerRunUnderlay(thinBar, 2.5);
    for (let i = 1; i < line.length; i++) {
      const d = Math.hypot(
        line[i][0] - line[i - 1][0],
        line[i][1] - line[i - 1][1],
      );
      expect(d).toBeGreaterThanOrEqual(2.5 * 0.8);
      expect(d).toBeLessThanOrEqual(2.5 * 1.2);
    }
  });

  it("極小面積の shape (≦ 0.25mm²) に対して空配列を返す", () => {
    const dot: Shape = {
      outer: [
        [0, 0],
        [0.5, 0],
        [0.5, 0.5],
        [0, 0.5],
      ],
      holes: [],
    };
    expect(centerRunUnderlay(dot, 2.5)).toEqual([]);
  });
});

describe("__internal helpers", () => {
  it("offsetShapeInward は outer -delta / 穴 +delta で 2 本", () => {
    const shape: Shape = {
      outer: [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
      holes: [
        [
          [4, 4],
          [6, 4],
          [6, 6],
          [4, 6],
        ],
      ],
    };
    expect(__internal.offsetShapeInward(shape, 0.5)).toHaveLength(2);
  });

  it("thinMaskZhangSuen は 10×3 horizontal bar を中央行 1 ピクセル幅にする", () => {
    // 標準 Zhang-Suen は端点を侵食するため、10px 幅入力に対して skeleton は概ね 6-10px。
    // 全ピクセルが中央行 (y=2) に集まる「1px 厚」の性質のみを strict にチェックする。
    const w = 12,
      h = 5;
    const mask = new Uint8Array(w * h);
    for (let y = 1; y <= 3; y++)
      for (let x = 1; x <= 10; x++) mask[y * w + x] = 1;
    const skel = __internal.thinMaskZhangSuen(mask, w, h);
    let centerCells = 0,
      otherCells = 0;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (!skel[y * w + x]) continue;
        if (y === 2) centerCells++;
        else otherCells++;
      }
    expect(centerCells).toBeGreaterThanOrEqual(6);
    expect(otherCells).toBeLessThanOrEqual(2);
  });
});

describe("edge cases", () => {
  const sq: Shape = {
    outer: [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ],
    holes: [],
  };

  it("edgeRunUnderlay: insetMm <= 0 / stitchLenMm <= 0 で空配列", () => {
    expect(edgeRunUnderlay(sq, 0, 2.5)).toEqual([]);
    expect(edgeRunUnderlay(sq, -0.1, 2.5)).toEqual([]);
    expect(edgeRunUnderlay(sq, 0.4, 0)).toEqual([]);
  });

  it("edgeRunUnderlay: inset が大きすぎて外形消失で空配列", () => {
    const tiny: Shape = {
      outer: [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
      holes: [],
    };
    expect(edgeRunUnderlay(tiny, 0.6, 2.5)).toEqual([]);
  });

  it("edgeRunUnderlay: 外形消失時は holes があっても空配列 (順序契約の保護)", () => {
    // [0,1]² の outer (1mm 角) を 0.6mm 内側オフセット → 消失。
    // 一方 hole は 0.4mm 角を +0.6mm 外側オフセットしても残るため、
    // 順序契約が破られないよう実装側で全体を [] にする必要がある。
    const withHole: Shape = {
      outer: [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
      holes: [
        [
          [0.3, 0.3],
          [0.7, 0.3],
          [0.7, 0.7],
          [0.3, 0.7],
        ],
      ],
    };
    expect(edgeRunUnderlay(withHole, 0.6, 2.5)).toEqual([]);
  });

  it("centerRunUnderlay: 三角形でも 2 点以上の polyline", () => {
    const tri: Shape = {
      outer: [
        [0, 0],
        [5, 0],
        [2.5, 4],
      ],
      holes: [],
    };
    expect(centerRunUnderlay(tri, 1.0).length).toBeGreaterThanOrEqual(2);
  });
});
