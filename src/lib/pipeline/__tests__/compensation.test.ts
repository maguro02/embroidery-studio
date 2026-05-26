import { describe, it, expect } from "vitest";
import { __internal, applyPullCompensation } from "../compensation";
import { getFabricProfile } from "../fabric";
import { analyzeShape } from "../geometry";
import type { EmbroideryObject, Shape } from "../types";

const denim = getFabricProfile("denim"); // pullCompPerWidth=0.025, minPullCompMm=0.10

function makeObj(
  kind: "satin" | "fill" | "run",
  shape: Shape,
  propsOverride: Partial<EmbroideryObject["props"]> = {},
): EmbroideryObject {
  return {
    id: "o1",
    kind,
    colorIndex: 0,
    rgb: [0, 0, 0],
    shape,
    order: 0,
    props: { densityMm: 0.4, maxStitchMm: 7, ...propsOverride },
  };
}

function bbox(p: [number, number][]) {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const [x, y] of p) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { w: maxX - minX, h: maxY - minY, minX, maxX, minY, maxY };
}

describe("resolvePullAmount", () => {
  const shape: Shape = {
    outer: [
      [0, 0],
      [30, 0],
      [30, 7],
      [0, 7],
    ],
    holes: [],
  };

  it("props.pullCompMm が指定されていればそれを採用", () => {
    const obj = makeObj("satin", shape, { pullCompMm: 0.25 });
    expect(__internal.resolvePullAmount(obj, denim)).toBeCloseTo(0.25, 5);
  });

  it("pullCompPerSideMm のみ指定なら left/right の平均", () => {
    const obj = makeObj("satin", shape, {
      pullCompPerSideMm: { left: 0.1, right: 0.3 },
    });
    expect(__internal.resolvePullAmount(obj, denim)).toBeCloseTo(0.2, 5);
  });

  it("両方未指定なら pullCompForWidth(fabric, shortSide) を返す", () => {
    // 短軸 7mm, denim → max(0.10, 7*0.025) = 0.175mm
    const obj = makeObj("satin", shape);
    expect(__internal.resolvePullAmount(obj, denim)).toBeCloseTo(0.175, 3);
  });

  it("pullCompMm が pullCompPerSideMm より優先される", () => {
    const obj = makeObj("satin", shape, {
      pullCompMm: 0.5,
      pullCompPerSideMm: { left: 0.1, right: 0.2 },
    });
    expect(__internal.resolvePullAmount(obj, denim)).toBeCloseTo(0.5, 5);
  });
});

describe("offsetSatinByNormal", () => {
  it("水平方向の細長矩形 (30x7mm) を 0.2mm 外側オフセットすると短軸方向に 0.4mm 広がる", () => {
    const shape: Shape = {
      outer: [
        [0, 0],
        [30, 0],
        [30, 7],
        [0, 7],
      ],
      holes: [],
    };
    const out = __internal.offsetSatinByNormal(shape, 0.2);
    const b = bbox(out.outer);
    expect(b.h).toBeCloseTo(7.4, 1); // 短軸 = 7 + 2*0.2
    expect(b.w).toBeCloseTo(30, 1); // 長軸はほぼ変わらない
  });

  it("amount=0 のとき shape の頂点座標は元と一致する", () => {
    const shape: Shape = {
      outer: [
        [0, 0],
        [30, 0],
        [30, 7],
        [0, 7],
      ],
      holes: [],
    };
    const out = __internal.offsetSatinByNormal(shape, 0);
    for (let i = 0; i < shape.outer.length; i++) {
      expect(out.outer[i][0]).toBeCloseTo(shape.outer[i][0], 5);
      expect(out.outer[i][1]).toBeCloseTo(shape.outer[i][1], 5);
    }
  });

  it("斜め向き矩形でも PCA 短軸方向に広がる (回転不変)", () => {
    const rad = Math.PI / 6;
    const cos = Math.cos(rad),
      sin = Math.sin(rad);
    const rot = (x: number, y: number): [number, number] => [
      x * cos - y * sin,
      x * sin + y * cos,
    ];
    const shape: Shape = {
      outer: [rot(0, 0), rot(30, 0), rot(30, 7), rot(0, 7)],
      holes: [],
    };
    const out = __internal.offsetSatinByNormal(shape, 0.2);
    const { shortSide } = analyzeShape(out.outer);
    expect(shortSide).toBeCloseTo(7.4, 1);
  });
});

describe("applyPullCompensation", () => {
  it("Satin に pullCompMm=0.2 を指定すると短軸方向 bbox が +0.4mm 広がる", () => {
    const shape: Shape = {
      outer: [
        [0, 0],
        [30, 0],
        [30, 5],
        [0, 5],
      ],
      holes: [],
    };
    const obj = makeObj("satin", shape, { pullCompMm: 0.2 });
    const r = applyPullCompensation(obj, denim);
    const b = bbox(r.shape.outer);
    expect(b.h).toBeCloseTo(5.4, 1);
  });

  it("Satin で pullCompMm 未指定なら pullCompForWidth(fabric, shortSide) 値を採用", () => {
    const shape: Shape = {
      outer: [
        [0, 0],
        [30, 0],
        [30, 7],
        [0, 7],
      ],
      holes: [],
    };
    const obj = makeObj("satin", shape);
    const r = applyPullCompensation(obj, denim);
    const b = bbox(r.shape.outer);
    // amount = max(0.10, 7*0.025) = 0.175 → 短軸 7 + 0.35 = 7.35
    expect(b.h).toBeCloseTo(7.35, 1);
  });

  it("Run は参照同一で返り shape も不変", () => {
    const shape: Shape = {
      outer: [
        [0, 0],
        [10, 0],
      ],
      holes: [],
    };
    const obj = makeObj("run", shape, { pullCompMm: 0.2 });
    expect(applyPullCompensation(obj, denim)).toBe(obj);
  });

  it("Fill は PR8 では参照同一で返る (PR9 まで未対応)", () => {
    const shape: Shape = {
      outer: [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
      holes: [],
    };
    const obj = makeObj("fill", shape, { pullCompMm: 0.2 });
    expect(applyPullCompensation(obj, denim)).toBe(obj);
  });

  it("入力 obj.shape は破壊されない (非破壊性)", () => {
    const shape: Shape = {
      outer: [
        [0, 0],
        [30, 0],
        [30, 7],
        [0, 7],
      ],
      holes: [],
    };
    const snapshot = JSON.stringify(shape);
    const obj = makeObj("satin", shape, { pullCompMm: 0.2 });
    applyPullCompensation(obj, denim);
    expect(JSON.stringify(shape)).toBe(snapshot);
  });

  it("Satin 補正後の shape.holes は入力 holes と参照を共有しない", () => {
    const holes: [number, number][][] = [
      [
        [10, 2],
        [12, 2],
        [12, 4],
        [10, 4],
      ],
    ];
    const shape: Shape = {
      outer: [
        [0, 0],
        [30, 0],
        [30, 7],
        [0, 7],
      ],
      holes,
    };
    const obj = makeObj("satin", shape, { pullCompMm: 0.2 });
    const r = applyPullCompensation(obj, denim);
    expect(r.shape.holes).not.toBe(shape.holes);
    expect(r.shape.holes[0]).not.toBe(shape.holes[0]);
    expect(r.shape.holes).toEqual(shape.holes);
  });

  it("id / colorIndex / rgb / props / order / locked が維持される", () => {
    const shape: Shape = {
      outer: [
        [0, 0],
        [30, 0],
        [30, 5],
        [0, 5],
      ],
      holes: [],
    };
    const obj: EmbroideryObject = {
      id: "abc",
      kind: "satin",
      colorIndex: 3,
      rgb: [10, 20, 30],
      shape,
      order: 5,
      locked: true,
      props: { densityMm: 0.4, maxStitchMm: 7, pullCompMm: 0.2 },
    };
    const r = applyPullCompensation(obj, denim);
    expect(r.id).toBe("abc");
    expect(r.colorIndex).toBe(3);
    expect(r.rgb).toEqual([10, 20, 30]);
    expect(r.props).toEqual(obj.props);
    expect(r.order).toBe(5);
    expect(r.locked).toBe(true);
    expect(r.shape).not.toBe(shape);
  });

  it("pullCompPerSideMm のみ指定なら left/right 平均値で均一適用", () => {
    const shape: Shape = {
      outer: [
        [0, 0],
        [30, 0],
        [30, 5],
        [0, 5],
      ],
      holes: [],
    };
    const obj = makeObj("satin", shape, {
      pullCompPerSideMm: { left: 0.1, right: 0.3 },
    });
    const r = applyPullCompensation(obj, denim);
    const b = bbox(r.shape.outer);
    expect(b.h).toBeCloseTo(5.4, 1); // 平均 0.2 → 5 + 0.4
  });
});
