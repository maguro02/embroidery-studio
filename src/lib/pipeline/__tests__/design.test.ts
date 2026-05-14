import { describe, it, expect } from "vitest";
import { createDefaultObjectProps } from "../design";
import type { ObjectProps } from "../types";

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
