import { describe, it, expect } from "vitest";
import {
  __internal,
  generateStitches,
  renderDesign,
  renderRun,
  renderSatin,
  renderFill,
  type RenderContext,
  type RenderOptions,
} from "../render";
import { generateStitches as legacyGenerateStitches } from "../stitch";
import { buildObjects } from "../build-objects";
import { FABRIC_PROFILES } from "../fabric";
import type {
  EmbroideryDesign,
  EmbroideryObject,
  ObjectProps,
  Shape,
  StitchBlock,
} from "../types";
import type { ColorRegion } from "../vectorize";

const DUMMY_PROPS: ObjectProps = { densityMm: 1, maxStitchMm: 7 };

function makeCtx(overrides: Partial<RenderContext["opts"]> = {}): RenderContext {
  const opts = {
    widthMm: 100,
    heightMm: 100,
    widthPx: 100,
    stitchDensityMm: 1,
    satinMaxWidthMm: 2,
    ...overrides,
  };
  return { opts };
}

const {
  fillStitches,
  intersectScanline,
  analyzeShape,
  appendStitchesWithJumps,
  resolveShapeFillAngle,
} = __internal;

describe("intersectScanline (multi-ring)", () => {
  it("外形のみのとき従来通り 2 交点", () => {
    const outer: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    const xs = intersectScanline([outer], 0, 5, [1, 0]);
    xs.sort((a, b) => a - b);
    expect(xs.length).toBe(2);
    expect(xs[0]).toBeCloseTo(0);
    expect(xs[1]).toBeCloseTo(10);
  });

  it("穴があると 4 交点", () => {
    const outer: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    const hole: [number, number][] = [
      [3, 3],
      [7, 3],
      [7, 7],
      [3, 7],
    ];
    const xs = intersectScanline([outer, hole], 0, 5, [1, 0]);
    xs.sort((a, b) => a - b);
    expect(xs.length).toBe(4);
    expect(xs[0]).toBeCloseTo(0);
    expect(xs[1]).toBeCloseTo(3);
    expect(xs[2]).toBeCloseTo(7);
    expect(xs[3]).toBeCloseTo(10);
  });
});

describe("fillStitches with hole", () => {
  it("穴を持つ正方形では、穴の中をまたぐ縫い目が生成されない", () => {
    const outer: [number, number][] = [
      [0, 0],
      [20, 0],
      [20, 20],
      [0, 20],
    ];
    const hole: [number, number][] = [
      [8, 8],
      [12, 8],
      [12, 12],
      [8, 12],
    ];
    const shape: Shape = { outer, holes: [hole] };
    // angleDeg=0 → dir=[1,0], perp=[0,1] で水平スキャン
    const segments = fillStitches(shape, 1, 0);
    const allPts = segments.flat();
    // 穴の中 y∈[9,11], x∈[8.5,11.5] にステッチ端点が来ないことを確認
    for (let yi = 9; yi <= 11; yi++) {
      const onLine = allPts.filter(
        ([, y]: [number, number]) => Math.abs(y - yi) < 0.5,
      );
      const inHole = onLine.filter(
        ([x]: [number, number]) => x > 8.5 && x < 11.5,
      );
      expect(inHole.length).toBe(0);
    }
  });

  it("穴ありで複数 segment に分割される", () => {
    const outer: [number, number][] = [
      [0, 0],
      [20, 0],
      [20, 20],
      [0, 20],
    ];
    const hole: [number, number][] = [
      [8, 8],
      [12, 8],
      [12, 12],
      [8, 12],
    ];
    const shape: Shape = { outer, holes: [hole] };
    const segments = fillStitches(shape, 1, 0);
    // 各 segment は 2 点で穴を跨がない区間
    for (const seg of segments) {
      expect(seg.length).toBe(2);
    }
    // 穴 (y∈[8,12]) を跨ぐ scanline は 2 segment に分かれている
    const segsOnHoleLine = segments.filter(
      (seg) => Math.abs(seg[0][1] - 10) < 0.5,
    );
    expect(segsOnHoleLine.length).toBeGreaterThanOrEqual(2);
  });

  it("穴なしのときは各 scanline が 1 segment", () => {
    const outer: [number, number][] = [
      [0, 0],
      [20, 0],
      [20, 20],
      [0, 20],
    ];
    const shape: Shape = { outer, holes: [] };
    const segments = fillStitches(shape, 1, 0);
    expect(segments.length).toBeGreaterThan(0);
    for (const seg of segments) {
      expect(seg.length).toBe(2);
    }
  });
});

describe("analyzeShape は outer のみで計算", () => {
  it("穴を渡さなくても短辺長が正しい", () => {
    const outer: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 2],
      [0, 2],
    ];
    const r = analyzeShape(outer);
    expect(r.shortSide).toBeCloseTo(2, 1);
  });
});

describe("appendStitchesWithJumps - basic", () => {
  it("prev=undefined のときは forceJumpAtStart=true でも jump を挿入しない", () => {
    const block: StitchBlock = {
      colorIndex: 0,
      rgb: [0, 0, 0],
      stitches: [],
    };
    appendStitchesWithJumps(
      block,
      [
        [0, 0],
        [1, 0],
        [2, 0],
      ],
      "run",
      0,
      7,
      8,
      true,
    );
    expect(block.stitches.every((s) => s.kind === "run")).toBe(true);
    expect(block.stitches.map((s) => [s.x, s.y])).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
    ]);
  });

  it("forceJumpAtStart=true + dist<=trimThreshold で trim なし jump あり、pts[0] も STITCH として残す", () => {
    const block: StitchBlock = {
      colorIndex: 0,
      rgb: [0, 0, 0],
      stitches: [{ x: 0, y: 0, kind: "run", colorIndex: 0 }],
    };
    appendStitchesWithJumps(
      block,
      [
        [5, 0],
        [6, 0],
        [7, 0],
      ],
      "fill",
      0,
      7,
      8,
      true,
    );
    // 期待: prev(0,0), jump(5,0), fill(5,0), fill(6,0), fill(7,0)
    expect(block.stitches.length).toBe(5);
    expect(block.stitches[1]).toMatchObject({ x: 5, y: 0, kind: "jump" });
    expect(block.stitches[2]).toMatchObject({ x: 5, y: 0, kind: "fill" });
    expect(block.stitches[3]).toMatchObject({ x: 6, y: 0, kind: "fill" });
    expect(block.stitches[4]).toMatchObject({ x: 7, y: 0, kind: "fill" });
    // prev → pts[0] の gap (0 < x < 5) には fill が入らない
    const fillsInGap = block.stitches.filter(
      (s) => s.kind === "fill" && s.x > 0 && s.x < 5,
    );
    expect(fillsInGap.length).toBe(0);
  });

  it("dist>trimThreshold で trim + jump 両方挿入、pts[0] も STITCH として残す", () => {
    const block: StitchBlock = {
      colorIndex: 0,
      rgb: [0, 0, 0],
      stitches: [{ x: 0, y: 0, kind: "fill", colorIndex: 0 }],
    };
    appendStitchesWithJumps(
      block,
      [
        [50, 0],
        [51, 0],
      ],
      "fill",
      0,
      7,
      8,
      true,
    );
    // 期待: prev(0,0), trim(0,0), jump(50,0), fill(50,0), fill(51,0)
    expect(block.stitches.length).toBe(5);
    expect(block.stitches[1]).toMatchObject({ x: 0, y: 0, kind: "trim" });
    expect(block.stitches[2]).toMatchObject({ x: 50, y: 0, kind: "jump" });
    expect(block.stitches[3]).toMatchObject({ x: 50, y: 0, kind: "fill" });
    expect(block.stitches[4]).toMatchObject({ x: 51, y: 0, kind: "fill" });
    // prev → pts[0] の gap (0 < x < 50) には fill が細分化されて入らない
    const fillStitchesOnGap = block.stitches.filter(
      (s) => s.kind === "fill" && s.x > 0 && s.x < 50,
    );
    expect(fillStitchesOnGap.length).toBe(0);
  });

  it("forceJumpAtStart=false + 短距離 では jump 不要、prev から pts[0] を含めて縫う", () => {
    const block: StitchBlock = {
      colorIndex: 0,
      rgb: [0, 0, 0],
      stitches: [{ x: 0, y: 0, kind: "run", colorIndex: 0 }],
    };
    appendStitchesWithJumps(
      block,
      [
        [3, 0],
        [6, 0],
      ],
      "run",
      0,
      7,
      8,
      false,
    );
    expect(block.stitches.length).toBe(3);
    expect(block.stitches.every((s) => s.kind === "run")).toBe(true);
    expect(block.stitches.map((s) => s.x)).toEqual([0, 3, 6]);
  });

  it("forceJumpAtStart=false でも dist>maxStitchMm なら jump が入り、pts[0] は STITCH として残る", () => {
    const block: StitchBlock = {
      colorIndex: 0,
      rgb: [0, 0, 0],
      stitches: [{ x: 0, y: 0, kind: "run", colorIndex: 0 }],
    };
    appendStitchesWithJumps(
      block,
      [
        [20, 0],
        [21, 0],
      ],
      "run",
      0,
      7,
      8,
      false,
    );
    // 期待: prev(0,0), trim(0,0), jump(20,0), run(20,0), run(21,0)
    expect(block.stitches[1].kind).toBe("trim");
    expect(block.stitches[2]).toMatchObject({ x: 20, y: 0, kind: "jump" });
    expect(block.stitches[3]).toMatchObject({ x: 20, y: 0, kind: "run" });
    expect(block.stitches[4]).toMatchObject({ x: 21, y: 0, kind: "run" });
    const runOnGap = block.stitches.filter(
      (s) => s.kind === "run" && s.x > 0 && s.x < 20,
    );
    expect(runOnGap.length).toBe(0);
  });

  it("pts.length===1 で jump 必要なら trim+jump の後に pts[0] が STITCH として残る", () => {
    const block: StitchBlock = {
      colorIndex: 0,
      rgb: [0, 0, 0],
      stitches: [{ x: 0, y: 0, kind: "fill", colorIndex: 0 }],
    };
    appendStitchesWithJumps(block, [[50, 0]], "fill", 0, 7, 8, true);
    // 期待: prev(0,0), trim(0,0), jump(50,0), fill(50,0)
    expect(block.stitches.length).toBe(4);
    expect(block.stitches[1].kind).toBe("trim");
    expect(block.stitches[2]).toMatchObject({ x: 50, y: 0, kind: "jump" });
    expect(block.stitches[3]).toMatchObject({ x: 50, y: 0, kind: "fill" });
  });

  it("ループ内で d>maxStitchMm の区間は均等に細分化される", () => {
    const block: StitchBlock = {
      colorIndex: 0,
      rgb: [0, 0, 0],
      stitches: [],
    };
    appendStitchesWithJumps(
      block,
      [
        [0, 0],
        [14, 0],
      ],
      "fill",
      0,
      7,
      8,
      false,
    );
    expect(block.stitches.map((s) => [s.x, s.y])).toEqual([
      [0, 0],
      [7, 0],
      [14, 0],
    ]);
    expect(block.stitches.every((s) => s.kind === "fill")).toBe(true);
  });

  it("BUG-REGRESSION: jump 直後の prev→pts[0] 区間に kind 縫いが細分化されない", () => {
    const block: StitchBlock = {
      colorIndex: 0,
      rgb: [0, 0, 0],
      stitches: [{ x: 0, y: 0, kind: "fill", colorIndex: 0 }],
    };
    appendStitchesWithJumps(
      block,
      [
        [100, 0],
        [101, 0],
      ],
      "fill",
      0,
      7,
      8,
      true,
    );
    // prev→pts[0] のギャップ (0 < x < 100) に fill が細分化されて入らないこと（バグの核心）
    const fillsInGap = block.stitches.filter(
      (s) => s.kind === "fill" && s.x > 0 && s.x < 100,
    );
    expect(fillsInGap.length).toBe(0);
    // jump は 1 本
    expect(block.stitches.filter((s) => s.kind === "jump").length).toBe(1);
    // pts[0]=(100,0) と pts[1]=(101,0) は STITCH として残る
    expect(
      block.stitches.some((s) => s.kind === "fill" && s.x === 100 && s.y === 0),
    ).toBe(true);
    expect(
      block.stitches.some((s) => s.kind === "fill" && s.x === 101 && s.y === 0),
    ).toBe(true);
  });
});

describe("resolveShapeFillAngle", () => {
  it("色別 override があれば strategy より優先される", () => {
    const angle = resolveShapeFillAngle(
      30, // override
      "shape-long-axis",
      45, // global
      [0, 1], // 縦長軸
      10, // 長い
      1.5,
    );
    expect(angle).toBe(30);
  });

  it("global-angle のときは fillAngleDeg を返す", () => {
    expect(
      resolveShapeFillAngle(undefined, "global-angle", 45, [0, 1], 10, 1.5),
    ).toBe(45);
  });

  it("等方形 (aspectRatio < minAspect) では global にフォールバック", () => {
    expect(
      resolveShapeFillAngle(undefined, "shape-long-axis", 45, [0, 1], 1.2, 1.5),
    ).toBe(45);
  });

  it("shape-long-axis は長軸方向の角度を返す", () => {
    // longAxis = [0,1] (垂直) → atan2(1,0) = 90°
    expect(
      resolveShapeFillAngle(undefined, "shape-long-axis", 0, [0, 1], 10, 1.5),
    ).toBeCloseTo(90);
    // longAxis = [1,0] (水平) → atan2(0,1) = 0°
    expect(
      resolveShapeFillAngle(undefined, "shape-long-axis", 0, [1, 0], 10, 1.5),
    ).toBeCloseTo(0);
  });

  it("shape-cross-axis は長軸 + 90° を返す", () => {
    expect(
      resolveShapeFillAngle(undefined, "shape-cross-axis", 0, [0, 1], 10, 1.5),
    ).toBeCloseTo(180);
    expect(
      resolveShapeFillAngle(undefined, "shape-cross-axis", 0, [1, 0], 10, 1.5),
    ).toBeCloseTo(90);
  });
});

describe("generateStitches with fillStrategy", () => {
  it("shape-long-axis: 縦長矩形は縦方向に塗られる", () => {
    // 縦長 (10x40) の矩形を塗る。長軸は y 方向なので、scanline は y 方向に沿う。
    // 1 行のステッチ 2 点は (x, ymin) → (x, ymax) のように Δy >> Δx となる。
    const regions: ColorRegion[] = [
      {
        colorIndex: 0,
        rgb: [0, 0, 0],
        svgPath: "",
        polygons: [],
        shapes: [
          {
            outer: [
              [0, 0],
              [10, 0],
              [10, 40],
              [0, 40],
            ],
            holes: [],
          },
        ],
      },
    ];
    const pattern = generateStitches({
      regions,
      widthMm: 50,
      heightMm: 50,
      widthPx: 50,
      heightPx: 50,
      stitchDensityMm: 1,
      satinMaxWidthMm: 2, // satin にならないように低めに
      fillAngleDeg: 0,
      fillStrategy: "shape-long-axis",
    });
    const fills = pattern.blocks[0].stitches.filter((s) => s.kind === "fill");
    expect(countAdjacent(fills, "vertical")).toBeGreaterThan(
      countAdjacent(fills, "horizontal"),
    );
  });

  it("shape-cross-axis: 縦長矩形は横方向に塗られる", () => {
    const regions: ColorRegion[] = [
      {
        colorIndex: 0,
        rgb: [0, 0, 0],
        svgPath: "",
        polygons: [],
        shapes: [
          {
            outer: [
              [0, 0],
              [10, 0],
              [10, 40],
              [0, 40],
            ],
            holes: [],
          },
        ],
      },
    ];
    const pattern = generateStitches({
      regions,
      widthMm: 50,
      heightMm: 50,
      widthPx: 50,
      heightPx: 50,
      stitchDensityMm: 1,
      satinMaxWidthMm: 2,
      fillAngleDeg: 90, // global は縦だが strategy が cross-axis なので横になるはず
      fillStrategy: "shape-cross-axis",
    });
    const fills = pattern.blocks[0].stitches.filter((s) => s.kind === "fill");
    expect(countAdjacent(fills, "horizontal")).toBeGreaterThan(
      countAdjacent(fills, "vertical"),
    );
  });

  it("等方形は strategy が shape-* でも fillAngleDeg にフォールバック", () => {
    // 20x20 の正方形 (aspect=1) → fallback して fillAngleDeg=0 (水平 scanline) になる
    const regions: ColorRegion[] = [
      {
        colorIndex: 0,
        rgb: [0, 0, 0],
        svgPath: "",
        polygons: [],
        shapes: [
          {
            outer: [
              [0, 0],
              [20, 0],
              [20, 20],
              [0, 20],
            ],
            holes: [],
          },
        ],
      },
    ];
    const pattern = generateStitches({
      regions,
      widthMm: 50,
      heightMm: 50,
      widthPx: 50,
      heightPx: 50,
      stitchDensityMm: 1,
      satinMaxWidthMm: 0.5, // satin にならないように極小
      fillAngleDeg: 0,
      fillStrategy: "shape-long-axis",
    });
    const fills = pattern.blocks[0].stitches.filter((s) => s.kind === "fill");
    // 0° → 行内ステッチは水平方向
    expect(countAdjacent(fills, "horizontal")).toBeGreaterThan(
      countAdjacent(fills, "vertical"),
    );
  });
});

function countAdjacent(
  stitches: { x: number; y: number }[],
  axis: "horizontal" | "vertical",
): number {
  let n = 0;
  for (let i = 1; i < stitches.length; i++) {
    const dx = Math.abs(stitches[i].x - stitches[i - 1].x);
    const dy = Math.abs(stitches[i].y - stitches[i - 1].y);
    if (axis === "horizontal" && dx > dy) n++;
    if (axis === "vertical" && dy > dx) n++;
  }
  return n;
}

describe("generateStitches integration - jump-after-init bug", () => {
  it("離れた 2 つの fill 矩形の間に fill 縫い目が現れない", () => {
    const regions: ColorRegion[] = [
      {
        colorIndex: 0,
        rgb: [0, 0, 0],
        svgPath: "",
        polygons: [],
        shapes: [
          {
            outer: [
              [0, 0],
              [50, 0],
              [50, 50],
              [0, 50],
            ],
            holes: [],
          },
          {
            outer: [
              [200, 0],
              [250, 0],
              [250, 50],
              [200, 50],
            ],
            holes: [],
          },
        ],
      },
    ];
    const pattern = generateStitches({
      regions,
      widthMm: 300,
      heightMm: 300,
      widthPx: 300,
      heightPx: 300,
      stitchDensityMm: 1,
      satinMaxWidthMm: 2,
    });
    const block = pattern.blocks[0];
    const fillsInGap = block.stitches.filter(
      (s) => s.kind === "fill" && s.x > 55 && s.x < 195,
    );
    expect(fillsInGap.length).toBe(0);
    const jumpsInGap = block.stitches.filter(
      (s) => s.kind === "jump" && s.x > 50 && s.x < 250,
    );
    expect(jumpsInGap.length).toBeGreaterThan(0);
  });

  it("離れた 2 つの細い outline (run) の間に run 縫い目が現れない", () => {
    const regions: ColorRegion[] = [
      {
        colorIndex: 0,
        rgb: [0, 0, 0],
        svgPath: "",
        polygons: [],
        shapes: [
          {
            outer: [
              [0, 0],
              [10, 0],
              [10, 0.5],
              [0, 0.5],
            ],
            holes: [],
          },
          {
            outer: [
              [100, 0],
              [110, 0],
              [110, 0.5],
              [100, 0.5],
            ],
            holes: [],
          },
        ],
      },
    ];
    const pattern = generateStitches({
      regions,
      widthMm: 200,
      heightMm: 200,
      widthPx: 200,
      heightPx: 200,
      stitchDensityMm: 1,
      satinMaxWidthMm: 2,
    });
    const block = pattern.blocks[0];
    const runsInGap = block.stitches.filter(
      (s) => s.kind === "run" && s.x > 15 && s.x < 95,
    );
    expect(runsInGap.length).toBe(0);
  });

  it("離れた 2 本の satin 棒の間に satin 縫い目が現れない", () => {
    const regions: ColorRegion[] = [
      {
        colorIndex: 0,
        rgb: [0, 0, 0],
        svgPath: "",
        polygons: [],
        shapes: [
          {
            outer: [
              [0, 0],
              [20, 0],
              [20, 1],
              [0, 1],
            ],
            holes: [],
          },
          {
            outer: [
              [100, 0],
              [120, 0],
              [120, 1],
              [100, 1],
            ],
            holes: [],
          },
        ],
      },
    ];
    const pattern = generateStitches({
      regions,
      widthMm: 200,
      heightMm: 200,
      widthPx: 200,
      heightPx: 200,
      stitchDensityMm: 1,
      satinMaxWidthMm: 2,
    });
    const block = pattern.blocks[0];
    const satinsInGap = block.stitches.filter(
      (s) => s.kind === "satin" && s.x > 25 && s.x < 95,
    );
    expect(satinsInGap.length).toBe(0);
  });

  it("fillAngleByColorIndex で色ごとに fill 方向を切り替えられる", () => {
    // 同じ正方形を 2 色で塗り、色 0 = 0° (水平 scanline → 垂直方向の縞)、
    // 色 1 = 90° (垂直 scanline → 水平方向の縞) を指定。
    // 0° の scanline は perp=[0,1] (y 方向に行を進める) で各行内は dir=[1,0] に沿う 2 点。
    // 90° は perp=[-1,0] (x 方向に行を進める) で各行内は dir=[0,1] に沿う 2 点。
    const outer: [number, number][] = [
      [0, 0],
      [20, 0],
      [20, 20],
      [0, 20],
    ];
    const regions: ColorRegion[] = [
      {
        colorIndex: 0,
        rgb: [255, 0, 0],
        svgPath: "",
        polygons: [],
        shapes: [{ outer, holes: [] }],
      },
      {
        colorIndex: 1,
        rgb: [0, 0, 255],
        svgPath: "",
        polygons: [],
        shapes: [{ outer, holes: [] }],
      },
    ];
    const pattern = generateStitches({
      regions,
      widthMm: 20,
      heightMm: 20,
      widthPx: 20,
      heightPx: 20,
      stitchDensityMm: 1,
      satinMaxWidthMm: 2,
      fillAngleDeg: 0,
      fillAngleByColorIndex: { 1: 90 },
    });

    const block0 = pattern.blocks.find((b) => b.colorIndex === 0)!;
    const block1 = pattern.blocks.find((b) => b.colorIndex === 1)!;

    // 色 0 (0°): 隣接する 2 つの fill 点はだいたい x 方向に並ぶ (Δy ≈ 0)。
    const fills0 = block0.stitches.filter((s) => s.kind === "fill");
    const horiz0 = countAdjacent(fills0, "horizontal");
    const vert0 = countAdjacent(fills0, "vertical");
    expect(horiz0).toBeGreaterThan(vert0);

    // 色 1 (90°): 隣接する 2 つの fill 点はだいたい y 方向に並ぶ (Δx ≈ 0)。
    const fills1 = block1.stitches.filter((s) => s.kind === "fill");
    const horiz1 = countAdjacent(fills1, "horizontal");
    const vert1 = countAdjacent(fills1, "vertical");
    expect(vert1).toBeGreaterThan(horiz1);
  });

  it("穴あき矩形を fill しても、穴の中を fill 縫い目が横断しない", () => {
    const regions: ColorRegion[] = [
      {
        colorIndex: 0,
        rgb: [0, 0, 0],
        svgPath: "",
        polygons: [],
        shapes: [
          {
            outer: [
              [0, 0],
              [100, 0],
              [100, 100],
              [0, 100],
            ],
            holes: [
              [
                [40, 40],
                [60, 40],
                [60, 60],
                [40, 60],
              ],
            ],
          },
        ],
      },
    ];
    const pattern = generateStitches({
      regions,
      widthMm: 100,
      heightMm: 100,
      widthPx: 100,
      heightPx: 100,
      stitchDensityMm: 1,
      satinMaxWidthMm: 2,
    });
    const block = pattern.blocks[0];
    const fillsInHole = block.stitches.filter(
      (s) =>
        s.kind === "fill" && s.x > 41 && s.x < 59 && s.y > 41 && s.y < 59,
    );
    expect(fillsInHole.length).toBe(0);
  });
});

describe("renderRun", () => {
  it("細い帯 (shortSide < runMaxWidth) のオブジェクトから run 種別の Stitch だけが返る", () => {
    const obj: EmbroideryObject = {
      id: "0-0",
      kind: "run",
      colorIndex: 0,
      rgb: [0, 0, 0],
      shape: {
        outer: [
          [0, 0],
          [10, 0],
          [10, 0.3],
          [0, 0.3],
        ],
        holes: [],
      },
      props: DUMMY_PROPS,
      order: 0,
    };
    const stitches = renderRun(obj, makeCtx());
    expect(stitches.length).toBeGreaterThan(0);
    for (const s of stitches) {
      expect(s.kind).toBe("run");
    }
  });

  it("先頭の Stitch は outer の最初の点 ≒ 起点 で kind='run'", () => {
    const obj: EmbroideryObject = {
      id: "0-0",
      kind: "run",
      colorIndex: 3,
      rgb: [1, 2, 3],
      shape: {
        outer: [
          [2, 2],
          [12, 2],
          [12, 2.3],
          [2, 2.3],
        ],
        holes: [],
      },
      props: DUMMY_PROPS,
      order: 0,
    };
    const stitches = renderRun(obj, makeCtx());
    expect(stitches.length).toBeGreaterThan(0);
    expect(stitches[0]).toMatchObject({ x: 2, y: 2, kind: "run", colorIndex: 3 });
  });
});

describe("renderSatin", () => {
  it("細長 satin オブジェクトから satin 種別だけが返る", () => {
    const obj: EmbroideryObject = {
      id: "0-0",
      kind: "satin",
      colorIndex: 0,
      rgb: [0, 0, 0],
      shape: {
        outer: [
          [0, 0],
          [20, 0],
          [20, 1],
          [0, 1],
        ],
        holes: [],
      },
      props: DUMMY_PROPS,
      order: 0,
    };
    const stitches = renderSatin(obj, makeCtx());
    expect(stitches.length).toBeGreaterThan(0);
    for (const s of stitches) {
      expect(s.kind).toBe("satin");
    }
  });

  it("Stitch 数が既存 generateStitches を同入力で呼んだときの最初の block の satin 数と一致", () => {
    const outer: [number, number][] = [
      [0, 0],
      [20, 0],
      [20, 1],
      [0, 1],
    ];
    const obj: EmbroideryObject = {
      id: "0-0",
      kind: "satin",
      colorIndex: 0,
      rgb: [0, 0, 0],
      shape: { outer, holes: [] },
      props: DUMMY_PROPS,
      order: 0,
    };
    const region: ColorRegion = {
      colorIndex: 0,
      rgb: [0, 0, 0],
      svgPath: "",
      polygons: [],
      shapes: [{ outer, holes: [] }],
    };
    const fromRenderer = renderSatin(obj, makeCtx());
    const fromLegacy = generateStitches({
      regions: [region],
      widthMm: 100,
      heightMm: 100,
      widthPx: 100,
      heightPx: 100,
      stitchDensityMm: 1,
      satinMaxWidthMm: 2,
    });
    const satinCount = fromLegacy.blocks[0].stitches.filter(
      (s) => s.kind === "satin",
    ).length;
    expect(fromRenderer.filter((s) => s.kind === "satin").length).toBe(satinCount);
  });
});

describe("renderFill", () => {
  it("普通の塗りオブジェクトから fill 種別の縫い目を返し、穴の中は走らない", () => {
    const obj: EmbroideryObject = {
      id: "0-0",
      kind: "fill",
      colorIndex: 0,
      rgb: [0, 0, 0],
      shape: {
        outer: [
          [0, 0],
          [100, 0],
          [100, 100],
          [0, 100],
        ],
        holes: [
          [
            [40, 40],
            [60, 40],
            [60, 60],
            [40, 60],
          ],
        ],
      },
      props: DUMMY_PROPS,
      order: 0,
    };
    const stitches = renderFill(obj, makeCtx());
    const fills = stitches.filter((s) => s.kind === "fill");
    expect(fills.length).toBeGreaterThan(0);
    const fillsInHole = fills.filter(
      (s) => s.x > 41 && s.x < 59 && s.y > 41 && s.y < 59,
    );
    expect(fillsInHole.length).toBe(0);
  });

  it("renderer 出力の先頭は jump/trim/stop ではなく、stop は決して含まない", () => {
    const obj: EmbroideryObject = {
      id: "0-0",
      kind: "fill",
      colorIndex: 0,
      rgb: [0, 0, 0],
      shape: {
        outer: [
          [0, 0],
          [20, 0],
          [20, 20],
          [0, 20],
        ],
        holes: [],
      },
      props: DUMMY_PROPS,
      order: 0,
    };
    const stitches = renderFill(obj, makeCtx());
    expect(stitches.length).toBeGreaterThan(0);
    // 先頭は jump/trim/stop ではなく、実 stitch (fill) であること (prev=undefined 挙動)
    expect(["jump", "trim", "stop"]).not.toContain(stitches[0].kind);
    // stop は renderer の責務外
    expect(stitches.some((s) => s.kind === "stop")).toBe(false);
  });
});

describe("renderDesign", () => {
  const baseOpts: RenderOptions = {
    widthMm: 100,
    heightMm: 100,
    widthPx: 100,
    stitchDensityMm: 1,
    satinMaxWidthMm: 2,
  };

  function makeFillObj(
    id: string,
    colorIndex: number,
    order: number,
    outer: [number, number][],
  ): EmbroideryObject {
    return {
      id,
      kind: "fill",
      colorIndex,
      rgb: [colorIndex * 50, 0, 0],
      shape: { outer, holes: [] },
      props: DUMMY_PROPS,
      order,
    };
  }

  it("単一オブジェクト (kind=fill) を含む design から block 1 個の pattern を返す", () => {
    const design: EmbroideryDesign = {
      widthMm: 100,
      heightMm: 100,
      fabric: FABRIC_PROFILES.denim,
      objects: [
        makeFillObj("0-0", 0, 0, [
          [0, 0],
          [20, 0],
          [20, 20],
          [0, 20],
        ]),
      ],
    };
    const pattern = renderDesign(design, baseOpts);
    expect(pattern.blocks.length).toBe(1);
    expect(pattern.blocks[0].colorIndex).toBe(0);
    expect(pattern.blocks[0].stitches.length).toBeGreaterThan(0);
    // 単一 block には末尾 stop は付かない
    expect(pattern.blocks[0].stitches.some((s) => s.kind === "stop")).toBe(false);
  });

  it("異なる colorIndex のオブジェクト 2 個から block 2 個を返し、前 block 末尾に kind=stop が挟まる", () => {
    const outer: [number, number][] = [
      [0, 0],
      [20, 0],
      [20, 20],
      [0, 20],
    ];
    const design: EmbroideryDesign = {
      widthMm: 100,
      heightMm: 100,
      fabric: FABRIC_PROFILES.denim,
      objects: [
        makeFillObj("0-0", 0, 0, outer),
        makeFillObj("1-0", 1, 1, outer),
      ],
    };
    const pattern = renderDesign(design, baseOpts);
    expect(pattern.blocks.length).toBe(2);
    expect(pattern.blocks[0].colorIndex).toBe(0);
    expect(pattern.blocks[1].colorIndex).toBe(1);
    // 前 block 末尾に stop が 1 つだけ挿入されている
    const stopsInBlock0 = pattern.blocks[0].stitches.filter(
      (s) => s.kind === "stop",
    );
    expect(stopsInBlock0.length).toBe(1);
    expect(pattern.blocks[0].stitches[pattern.blocks[0].stitches.length - 1].kind).toBe("stop");
    // 後 block には stop は付かない
    expect(pattern.blocks[1].stitches.some((s) => s.kind === "stop")).toBe(false);
  });

  it("同じ colorIndex の fill + run が混在しても 1 block にマージされる", () => {
    const fillOuter: [number, number][] = [
      [0, 0],
      [20, 0],
      [20, 20],
      [0, 20],
    ];
    const runOuter: [number, number][] = [
      [30, 0],
      [40, 0],
      [40, 0.3],
      [30, 0.3],
    ];
    const design: EmbroideryDesign = {
      widthMm: 100,
      heightMm: 100,
      fabric: FABRIC_PROFILES.denim,
      objects: [
        makeFillObj("0-0", 0, 0, fillOuter),
        {
          id: "0-1",
          kind: "run",
          colorIndex: 0,
          rgb: [0, 0, 0],
          shape: { outer: runOuter, holes: [] },
          props: DUMMY_PROPS,
          order: 1,
        },
      ],
    };
    const pattern = renderDesign(design, baseOpts);
    expect(pattern.blocks.length).toBe(1);
    const kinds = new Set(pattern.blocks[0].stitches.map((s) => s.kind));
    expect(kinds.has("fill")).toBe(true);
    expect(kinds.has("run")).toBe(true);
  });

  it("order の昇順で描画される (大きい order が後)", () => {
    // 離れた 2 つの fill (同色)。order を逆順 (10, 0) で渡しても、
    // 描画は order 昇順なので order=0 (右の矩形) が先になる。
    const leftSquare: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    const rightSquare: [number, number][] = [
      [50, 0],
      [60, 0],
      [60, 10],
      [50, 10],
    ];
    const objects: EmbroideryObject[] = [
      // わざと order=10 を先に並べる
      makeFillObj("0-1", 0, 10, leftSquare),
      makeFillObj("0-0", 0, 0, rightSquare),
    ];
    const design: EmbroideryDesign = {
      widthMm: 100,
      heightMm: 100,
      fabric: FABRIC_PROFILES.denim,
      objects,
    };
    const pattern = renderDesign(design, baseOpts);
    const fills = pattern.blocks[0].stitches.filter((s) => s.kind === "fill");
    // 最初の fill は order=0 の右側矩形 (x>=50) から始まるはず
    expect(fills[0].x).toBeGreaterThanOrEqual(50);
    // 最後の fill は order=10 の左側矩形 (x<=10) で終わるはず
    expect(fills[fills.length - 1].x).toBeLessThanOrEqual(10);
  });

  // NOTE (documentation-level guard):
  //   PR4 完了時点で stitch.ts は `export * from "./render"` の shim になり、
  //   `legacyGenerateStitches` と `generateStitches` は同一関数を指す。
  //   ここでの比較は「2 経路で同じ実装を呼ぶ」自己参照になり、リファクタ等価性の
  //   強い回帰検出にはならない。PR5 で golden 値ベースのテストに置き換える予定
  //   (PR5 commit "test(pipeline): break self-referential render equivalence check")。
  //   それまでは shim 経由でも例外が出ないことの smoke test として残す。
  it("equivalence: 既存 stitch.ts の generateStitches と renderDesign(buildObjects) が完全一致", () => {
    // 3 色を含む region 入力。fill / satin / run の全 kind を網羅。
    const regions: ColorRegion[] = [
      {
        colorIndex: 0,
        rgb: [255, 0, 0],
        svgPath: "",
        polygons: [],
        shapes: [
          {
            outer: [
              [0, 0],
              [100, 0],
              [100, 100],
              [0, 100],
            ],
            holes: [
              [
                [40, 40],
                [60, 40],
                [60, 60],
                [40, 60],
              ],
            ],
          },
        ],
      },
      {
        colorIndex: 1,
        rgb: [0, 255, 0],
        svgPath: "",
        polygons: [],
        shapes: [
          {
            outer: [
              [150, 0],
              [250, 0],
              [250, 8],
              [150, 8],
            ],
            holes: [],
          },
        ],
      },
      {
        colorIndex: 2,
        rgb: [0, 0, 255],
        svgPath: "",
        polygons: [],
        shapes: [
          {
            outer: [
              [0, 150],
              [100, 150],
              [100, 154],
              [0, 154],
            ],
            holes: [],
          },
        ],
      },
    ];
    const sharedOpts = {
      widthMm: 50,
      heightMm: 50,
      widthPx: 500,
      heightPx: 500,
      stitchDensityMm: 0.4,
      satinMaxWidthMm: 6,
    };

    const legacy = legacyGenerateStitches({ ...sharedOpts, regions });
    const objects = buildObjects({
      ...sharedOpts,
      regions,
      fabric: FABRIC_PROFILES.denim,
    });
    const design: EmbroideryDesign = {
      widthMm: sharedOpts.widthMm,
      heightMm: sharedOpts.heightMm,
      fabric: FABRIC_PROFILES.denim,
      objects,
    };
    const fresh = renderDesign(design, sharedOpts);

    // pattern.widthMm/heightMm/totalStitches は両方同じ
    expect(fresh.widthMm).toBe(legacy.widthMm);
    expect(fresh.heightMm).toBe(legacy.heightMm);
    expect(fresh.totalStitches).toBe(legacy.totalStitches);
    // blocks 数も同じ
    expect(fresh.blocks.length).toBe(legacy.blocks.length);
    // 各 block の全 stitch が一致 (x, y, kind, colorIndex)
    for (let i = 0; i < legacy.blocks.length; i++) {
      const lb = legacy.blocks[i];
      const fb = fresh.blocks[i];
      expect(fb.colorIndex).toBe(lb.colorIndex);
      expect(fb.rgb).toEqual(lb.rgb);
      expect(fb.stitches.length).toBe(lb.stitches.length);
      for (let j = 0; j < lb.stitches.length; j++) {
        expect(fb.stitches[j]).toEqual(lb.stitches[j]);
      }
    }
  });
});
