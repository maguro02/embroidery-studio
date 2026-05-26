import { describe, it, expect } from "vitest";
import {
  shapesTouch,
  findBranches,
  chooseEntryExit,
  type EdgePoint,
} from "../pathing";
import type { BranchGroup, EmbroideryObject, Point2D, Shape } from "../types";

function makeObj(
  id: string,
  colorIndex: number,
  outer: Point2D[],
  kind: "fill" | "satin" | "run" = "fill",
): EmbroideryObject {
  return {
    id,
    colorIndex,
    rgb: [0, 0, 0],
    order: 0,
    kind,
    shape: { outer, holes: [] },
    props: { densityMm: 0.4, maxStitchMm: 7 },
  };
}

describe("pathing module skeleton", () => {
  it("exports shapesTouch / findBranches / chooseEntryExit", () => {
    expect(typeof shapesTouch).toBe("function");
    expect(typeof findBranches).toBe("function");
    expect(typeof chooseEntryExit).toBe("function");
  });
  it("BranchGroup は構造的に構築可能", () => {
    const g: BranchGroup = { objectIds: ["a"], colorIndex: 0 };
    expect(g.objectIds[0]).toBe("a");
  });
  it("EdgePoint は構造的に構築可能", () => {
    const ep: EdgePoint = { objId: "a", pt: [0, 0], side: "outer", index: 0 };
    expect(ep.side).toBe("outer");
  });
});

describe("shapesTouch — bbox pruning", () => {
  it("bbox が大きく離れていれば false", () => {
    const a: Shape = {
      outer: [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
      holes: [],
    };
    const b: Shape = {
      outer: [
        [100, 100],
        [110, 100],
        [110, 110],
        [100, 110],
      ],
      holes: [],
    };
    expect(shapesTouch(a, b)).toBe(false);
  });
  it("bbox 完全一致 + 線分も重複 → true", () => {
    const a: Shape = {
      outer: [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
      holes: [],
    };
    const b: Shape = {
      outer: [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
      holes: [],
    };
    expect(shapesTouch(a, b)).toBe(true);
  });
});

describe("shapesTouch — segment distance", () => {
  it("C 字のくぼみ内に b: bbox は overlap だが線分間距離は離れる → false", () => {
    const a: Shape = {
      outer: [
        [0, 0],
        [10, 0],
        [10, 2],
        [3, 2],
        [3, 8],
        [10, 8],
        [10, 10],
        [0, 10],
      ],
      holes: [],
    };
    const b: Shape = {
      outer: [
        [5, 4],
        [8, 4],
        [8, 6],
        [5, 6],
      ],
      holes: [],
    };
    expect(shapesTouch(a, b)).toBe(false);
  });
});

describe("shapesTouch — touching / overlapping / epsilon", () => {
  it("辺を共有する 2 正方形 → true", () => {
    const a: Shape = {
      outer: [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
      holes: [],
    };
    const b: Shape = {
      outer: [
        [10, 0],
        [20, 0],
        [20, 10],
        [10, 10],
      ],
      holes: [],
    };
    expect(shapesTouch(a, b)).toBe(true);
  });
  it("距離 0.4 (epsilon=0.5 デフォルト) → true", () => {
    const a: Shape = {
      outer: [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
      holes: [],
    };
    const b: Shape = {
      outer: [
        [10.4, 0],
        [20, 0],
        [20, 10],
        [10.4, 10],
      ],
      holes: [],
    };
    expect(shapesTouch(a, b)).toBe(true);
  });
  it("距離 0.6 (epsilon=0.5 デフォルト) → false", () => {
    const a: Shape = {
      outer: [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
      holes: [],
    };
    const b: Shape = {
      outer: [
        [10.6, 0],
        [20, 0],
        [20, 10],
        [10.6, 10],
      ],
      holes: [],
    };
    expect(shapesTouch(a, b)).toBe(false);
  });
  it("epsilon=1.0 なら距離 0.6 は true", () => {
    const a: Shape = {
      outer: [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
      holes: [],
    };
    const b: Shape = {
      outer: [
        [10.6, 0],
        [20, 0],
        [20, 10],
        [10.6, 10],
      ],
      holes: [],
    };
    expect(shapesTouch(a, b, 1.0)).toBe(true);
  });
});

describe("findBranches", () => {
  it("空配列 → 空配列", () => {
    expect(findBranches([])).toEqual([]);
  });

  it("同色 3 object が直線接触 → 1 group", () => {
    const a = makeObj("a", 0, [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]);
    const b = makeObj("b", 0, [
      [10, 0],
      [20, 0],
      [20, 10],
      [10, 10],
    ]);
    const c = makeObj("c", 0, [
      [20, 0],
      [30, 0],
      [30, 10],
      [20, 10],
    ]);
    expect(findBranches([a, b, c])).toEqual([
      { objectIds: ["a", "b", "c"], colorIndex: 0 },
    ]);
  });

  it("色が異なれば接触していても別 group", () => {
    const a = makeObj("a", 0, [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]);
    const b = makeObj("b", 1, [
      [10, 0],
      [20, 0],
      [20, 10],
      [10, 10],
    ]);
    expect(findBranches([a, b])).toEqual([
      { objectIds: ["a"], colorIndex: 0 },
      { objectIds: ["b"], colorIndex: 1 },
    ]);
  });

  it("孤立 object は 1 要素 group として返される", () => {
    const a = makeObj("a", 0, [
      [0, 0],
      [5, 0],
      [5, 5],
      [0, 5],
    ]);
    const b = makeObj("b", 0, [
      [100, 100],
      [105, 100],
      [105, 105],
      [100, 105],
    ]);
    const r = findBranches([a, b]);
    expect(r).toHaveLength(2);
    expect(r[0]).toEqual({ objectIds: ["a"], colorIndex: 0 });
    expect(r[1]).toEqual({ objectIds: ["b"], colorIndex: 0 });
  });

  it("出力順は最小入力 index 昇順で決定的", () => {
    const a = makeObj("a", 0, [
      [50, 0],
      [60, 0],
      [60, 10],
      [50, 10],
    ]);
    const b = makeObj("b", 0, [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]);
    const c = makeObj("c", 0, [
      [10, 0],
      [20, 0],
      [20, 10],
      [10, 10],
    ]);
    const r = findBranches([a, b, c]);
    expect(r).toEqual([
      { objectIds: ["a"], colorIndex: 0 },
      { objectIds: ["b", "c"], colorIndex: 0 },
    ]);
  });

  it("入力 objects を mutate しない (純関数)", () => {
    const a = makeObj("a", 0, [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]);
    const b = makeObj("b", 0, [
      [10, 0],
      [20, 0],
      [20, 10],
      [10, 10],
    ]);
    const snapshot = JSON.parse(JSON.stringify([a, b]));
    findBranches([a, b]);
    expect([a, b]).toEqual(snapshot);
  });
});

describe("chooseEntryExit (run)", () => {
  const runObj = (outer: Point2D[]): EmbroideryObject =>
    makeObj("run-1", 0, outer, "run");

  it("prevExit に近い端点が entry、反対端が exit", () => {
    const obj = runObj([
      [0, 0],
      [10, 0],
      [20, 0],
    ]);
    const r = chooseEntryExit(obj, [-5, 0]);
    expect(r.entry.pt).toEqual([0, 0]);
    expect(r.entry.objId).toBe("run-1");
    expect(r.entry.side).toBe("outer");
    expect(r.entry.index).toBe(0);
    expect(r.exit.pt).toEqual([20, 0]);
    expect(r.exit.index).toBe(2);
  });

  it("prevExit が反対側なら entry/exit が反転", () => {
    const obj = runObj([
      [0, 0],
      [10, 0],
      [20, 0],
    ]);
    const r = chooseEntryExit(obj, [25, 0]);
    expect(r.entry.pt).toEqual([20, 0]);
    expect(r.exit.pt).toEqual([0, 0]);
  });

  it("等距離なら index=0 を entry (決定性)", () => {
    const obj = runObj([
      [0, 0],
      [10, 0],
    ]);
    const r = chooseEntryExit(obj, [5, 100]);
    expect(r.entry.pt).toEqual([0, 0]);
    expect(r.exit.pt).toEqual([10, 0]);
  });
});

describe("chooseEntryExit (satin)", () => {
  const satinObj = (outer: Point2D[]): EmbroideryObject =>
    makeObj("sat-1", 0, outer, "satin");

  it("X 方向細長 satin: prevExit=(-5, 0.5) → entry x≒0, exit x≒20", () => {
    const obj = satinObj([
      [0, 0],
      [20, 0],
      [20, 1],
      [0, 1],
    ]);
    const r = chooseEntryExit(obj, [-5, 0.5]);
    expect(r.entry.pt[0]).toBeCloseTo(0);
    expect(r.exit.pt[0]).toBeCloseTo(20);
    expect(Math.abs(r.entry.pt[0] - r.exit.pt[0])).toBeGreaterThan(15);
  });

  it("Y 方向細長 satin: 縦方向に長軸を認識", () => {
    const obj = satinObj([
      [0, 0],
      [1, 0],
      [1, 20],
      [0, 20],
    ]);
    const r = chooseEntryExit(obj, [0.5, -5]);
    expect(r.entry.pt[1]).toBeCloseTo(0);
    expect(r.exit.pt[1]).toBeCloseTo(20);
  });
});

describe("chooseEntryExit (fill)", () => {
  const fillObj = (outer: Point2D[]): EmbroideryObject =>
    makeObj("fill-1", 0, outer, "fill");

  it("正方形 fill: prevExit=(-5,-5) → entry=(0,0), exit=(10,10)", () => {
    const obj = fillObj([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]);
    const r = chooseEntryExit(obj, [-5, -5]);
    expect(r.entry.pt).toEqual([0, 0]);
    expect(r.exit.pt).toEqual([10, 10]);
  });

  it("右上 prevExit → entry=(10,10), exit=(0,0)", () => {
    const obj = fillObj([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]);
    const r = chooseEntryExit(obj, [15, 15]);
    expect(r.entry.pt).toEqual([10, 10]);
    expect(r.exit.pt).toEqual([0, 0]);
  });
});
