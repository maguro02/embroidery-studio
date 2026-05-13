export type StitchKind = "run" | "satin" | "fill" | "jump" | "trim" | "stop";

/** px 単位の 2D 座標 */
export type Point2D = [number, number];

/** 閉ポリゴン。先頭と末尾は同一点でも非同一でも可。最低 3 点。 */
export type Polygon = Point2D[];

/**
 * 1 個の連結領域 = 外形 + 0 個以上の穴。
 * imagetracerjs における 1 つの <path d="..."> に対応する。
 * - outer: 外形リング（向きは正規化しない。fill/scanline は向き非依存）
 * - holes: 穴リング。外形に完全に内包される前提（fallback で補正）。
 */
export type Shape = {
  outer: Polygon;
  holes: Polygon[];
};

export type Stitch = {
  x: number;
  y: number;
  kind: StitchKind;
  colorIndex: number;
};

export type StitchBlock = {
  colorIndex: number;
  rgb: [number, number, number];
  stitches: Stitch[];
};

export type StitchPattern = {
  widthMm: number;
  heightMm: number;
  blocks: StitchBlock[];
  totalStitches: number;
};
