import { init as potraceInit, potrace } from "esm-potrace-wasm";

export type VectorizeInput = {
  labels: Uint8Array;
  width: number;
  height: number;
  palette: Array<[number, number, number]>;
  turdsize?: number;
  alphamax?: number;
  opttolerance?: number;
};

export type ColorRegion = {
  colorIndex: number;
  rgb: [number, number, number];
  svgPath: string;
  /** SVG path をパースした閉ポリゴン列 (px 座標、even-odd 想定) */
  polygons: Array<Array<[number, number]>>;
};

export interface Tracer {
  /** マスク画像から path の d 属性文字列を 1 つ以上返す */
  trace(mask: ImageData, opts: TracerOptions): Promise<string[]>;
}

export type TracerOptions = {
  turdsize: number;
  alphamax: number;
  opttolerance: number;
};

let potraceReady: Promise<void> | null = null;

/**
 * esm-potrace-wasm の注意点:
 * - `pathonly: true` の戻り値は型定義 `Promise<string>` と異なり **string[]** (upstream issue #14)
 * - 大きい入力で "RangeError: offset is out of bounds" / "memory access out of bounds" (issue #8)
 * - 内部で imageBitmapSource.constructor.name 判定があり ImageData 名が変わると誤判定
 *
 * 対策として:
 * - `pathonly: false` で SVG 全体文字列を取得し、d 属性を正規表現で抽出
 * - 入力 ImageData は呼び出し側で十分に小さくしておく (pipeline/index.ts MAX_DIMENSION)
 */
const defaultTracer: Tracer = {
  async trace(mask, opts) {
    if (!potraceReady) potraceReady = potraceInit();
    await potraceReady;
    const result = (await potrace(mask, {
      ...opts,
      pathonly: false,
      extractcolors: false,
      opticurve: 1,
      turnpolicy: 4,
    })) as string | string[];
    if (Array.isArray(result)) return result;
    return Array.from(result.matchAll(/d="([^"]+)"/g), (m) => m[1]);
  },
};

export async function vectorize(
  input: VectorizeInput,
  tracer: Tracer = defaultTracer,
): Promise<ColorRegion[]> {
  const {
    labels,
    width,
    height,
    palette,
    turdsize = 8,
    alphamax = 1,
    opttolerance = 0.2,
  } = input;
  const regions: ColorRegion[] = [];

  for (let colorIndex = 0; colorIndex < palette.length; colorIndex++) {
    const mask = buildMask(labels, width, height, colorIndex);
    if (mask === null) continue;

    const dList = await tracer.trace(mask, { turdsize, alphamax, opttolerance });
    const polygons: Array<Array<[number, number]>> = [];
    for (const d of dList) {
      const subs = parsePathD(d);
      polygons.push(...subs);
    }
    if (polygons.length === 0) continue;

    regions.push({
      colorIndex,
      rgb: palette[colorIndex],
      svgPath: dList.join(" "),
      polygons,
    });
  }

  return regions;
}

function buildMask(
  labels: Uint8Array,
  width: number,
  height: number,
  colorIndex: number,
): ImageData | null {
  const data = new Uint8ClampedArray(width * height * 4);
  let count = 0;
  for (let i = 0; i < labels.length; i++) {
    const match = labels[i] === colorIndex;
    if (match) count++;
    const v = match ? 0 : 255;
    data[i * 4 + 0] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  if (count === 0) return null;
  return new ImageData(data, width, height);
}

const BEZIER_SAMPLES = 8;

/** SVG path d 属性をパースして閉ポリゴン群を返す。Bezier は8分割で線形近似。 */
export function parsePathD(d: string): Array<Array<[number, number]>> {
  const polygons: Array<Array<[number, number]>> = [];
  let current: Array<[number, number]> = [];
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;

  const tokens = tokenize(d);
  let i = 0;
  let lastCmd = "";

  const pushPoint = (x: number, y: number) => {
    const last = current[current.length - 1];
    if (!last || last[0] !== x || last[1] !== y) current.push([x, y]);
    cx = x;
    cy = y;
  };

  const closeSub = () => {
    if (current.length >= 3) polygons.push(current);
    current = [];
  };

  while (i < tokens.length) {
    const t = tokens[i];
    let cmd: string;
    if (typeof t === "string") {
      cmd = t;
      i++;
    } else {
      cmd = lastCmd || "L";
    }
    lastCmd = cmd;
    const rel = cmd === cmd.toLowerCase();
    const u = cmd.toUpperCase();

    if (u === "M") {
      closeSub();
      const x = num(tokens, i++);
      const y = num(tokens, i++);
      const nx = rel ? cx + x : x;
      const ny = rel ? cy + y : y;
      startX = nx;
      startY = ny;
      pushPoint(nx, ny);
      lastCmd = rel ? "l" : "L";
    } else if (u === "L") {
      const x = num(tokens, i++);
      const y = num(tokens, i++);
      pushPoint(rel ? cx + x : x, rel ? cy + y : y);
    } else if (u === "H") {
      const x = num(tokens, i++);
      pushPoint(rel ? cx + x : x, cy);
    } else if (u === "V") {
      const y = num(tokens, i++);
      pushPoint(cx, rel ? cy + y : y);
    } else if (u === "C") {
      const x1 = num(tokens, i++);
      const y1 = num(tokens, i++);
      const x2 = num(tokens, i++);
      const y2 = num(tokens, i++);
      const x = num(tokens, i++);
      const y = num(tokens, i++);
      const p1x = rel ? cx + x1 : x1;
      const p1y = rel ? cy + y1 : y1;
      const p2x = rel ? cx + x2 : x2;
      const p2y = rel ? cy + y2 : y2;
      const ex = rel ? cx + x : x;
      const ey = rel ? cy + y : y;
      sampleCubic(cx, cy, p1x, p1y, p2x, p2y, ex, ey, pushPoint);
    } else if (u === "Q") {
      const x1 = num(tokens, i++);
      const y1 = num(tokens, i++);
      const x = num(tokens, i++);
      const y = num(tokens, i++);
      const p1x = rel ? cx + x1 : x1;
      const p1y = rel ? cy + y1 : y1;
      const ex = rel ? cx + x : x;
      const ey = rel ? cy + y : y;
      sampleQuadratic(cx, cy, p1x, p1y, ex, ey, pushPoint);
    } else if (u === "Z") {
      pushPoint(startX, startY);
      closeSub();
    } else {
      i++;
    }
  }
  closeSub();
  return polygons;
}

function tokenize(d: string): Array<string | number> {
  const out: Array<string | number> = [];
  const re = /([MmLlHhVvCcSsQqTtAaZz])|(-?\d*\.?\d+(?:[eE][-+]?\d+)?)/g;
  for (const m of d.matchAll(re)) {
    if (m[1]) out.push(m[1]);
    else out.push(parseFloat(m[2]));
  }
  return out;
}

function num(tokens: Array<string | number>, i: number): number {
  const v = tokens[i];
  if (typeof v !== "number") throw new Error(`SVG path: expected number at ${i}`);
  return v;
}

function sampleCubic(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  push: (x: number, y: number) => void,
) {
  for (let s = 1; s <= BEZIER_SAMPLES; s++) {
    const t = s / BEZIER_SAMPLES;
    const it = 1 - t;
    const x =
      it * it * it * x0 +
      3 * it * it * t * x1 +
      3 * it * t * t * x2 +
      t * t * t * x3;
    const y =
      it * it * it * y0 +
      3 * it * it * t * y1 +
      3 * it * t * t * y2 +
      t * t * t * y3;
    push(x, y);
  }
}

function sampleQuadratic(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  push: (x: number, y: number) => void,
) {
  for (let s = 1; s <= BEZIER_SAMPLES; s++) {
    const t = s / BEZIER_SAMPLES;
    const it = 1 - t;
    const x = it * it * x0 + 2 * it * t * x1 + t * t * x2;
    const y = it * it * y0 + 2 * it * t * y1 + t * t * y2;
    push(x, y);
  }
}
