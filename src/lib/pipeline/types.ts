export type StitchKind = "run" | "satin" | "fill" | "jump" | "trim" | "stop";

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
