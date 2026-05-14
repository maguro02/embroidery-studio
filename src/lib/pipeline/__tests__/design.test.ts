import { describe, it, expect } from "vitest";
import { createDefaultObjectProps, createEmptyDesign } from "../design";
import type { ObjectProps, FabricProfile, EmbroideryDesign } from "../types";

const stubFabric: FabricProfile = {
  kind: "denim",
  defaultDensityMm: 0.4,
  pullCompPerWidth: 0.025,
  minPullCompMm: 0.1,
  defaultPushCompMm: 0,
  underlayPolicy: {
    satin: () => ({ kind: "none" }),
    fill: () => ({ kind: "none" }),
    run: () => ({ kind: "none" }),
  },
};

describe("createDefaultObjectProps", () => {
  it("createDefaultObjectProps(\"run\") は angleDeg を含まない", () => {
    const p = createDefaultObjectProps("run") satisfies ObjectProps;
    expect(p.angleDeg).toBeUndefined();
    expect(p.densityMm).toBeGreaterThan(0);
    expect(p.maxStitchMm).toBeGreaterThan(0);
  });

  it("createDefaultObjectProps(\"satin\") は angleDeg=0 を含む", () => {
    const p = createDefaultObjectProps("satin");
    expect(p.angleDeg).toBe(0);
  });

  it("createDefaultObjectProps(\"fill\") は angleDeg=45 を含む", () => {
    const p = createDefaultObjectProps("fill");
    expect(p.angleDeg).toBe(45);
  });

  it("createDefaultObjectProps の戻り値は呼び出しごとに別オブジェクト", () => {
    const a = createDefaultObjectProps("fill");
    const b = createDefaultObjectProps("fill");
    expect(a).not.toBe(b);
    a.densityMm = 999;
    expect(b.densityMm).not.toBe(999);
  });
});

describe("createEmptyDesign", () => {
  it("createEmptyDesign は objects=[] の Design を返す", () => {
    const d = createEmptyDesign({ widthMm: 100, heightMm: 80, fabric: stubFabric }) satisfies EmbroideryDesign;
    expect(d.widthMm).toBe(100);
    expect(d.heightMm).toBe(80);
    expect(d.objects).toEqual([]);
  });

  it("createEmptyDesign は渡した fabric をそのまま保持する", () => {
    const d = createEmptyDesign({ widthMm: 50, heightMm: 50, fabric: stubFabric });
    expect(d.fabric).toBe(stubFabric);
  });

  it("createEmptyDesign の戻り値の objects は呼び出しごとに独立", () => {
    const d1 = createEmptyDesign({ widthMm: 1, heightMm: 1, fabric: stubFabric });
    const d2 = createEmptyDesign({ widthMm: 1, heightMm: 1, fabric: stubFabric });
    expect(d1.objects).not.toBe(d2.objects);
  });
});
