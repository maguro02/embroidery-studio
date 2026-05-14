import type {
  ObjectKind,
  ObjectProps,
  EmbroideryDesign,
  FabricProfile,
} from "./types";

// 後続 PR (fabric.ts) で生地依存に差し替えやすいよう、既定値は名前付き定数に集約する。
const DEFAULT_DENSITY_MM = 0.4;
const DEFAULT_MAX_STITCH_MM = 4;
const SATIN_MAX_STITCH_MM = 7;
const SATIN_ANGLE_DEG = 0;
const FILL_ANGLE_DEG = 45;

/** kind に応じた ObjectProps の既定値を生成する。戻り値は呼び出しごとに独立。 */
export function createDefaultObjectProps(kind: ObjectKind): ObjectProps {
  const base: ObjectProps = {
    densityMm: DEFAULT_DENSITY_MM,
    maxStitchMm: DEFAULT_MAX_STITCH_MM,
  };
  if (kind === "satin") {
    return { ...base, maxStitchMm: SATIN_MAX_STITCH_MM, angleDeg: SATIN_ANGLE_DEG };
  }
  if (kind === "fill") return { ...base, angleDeg: FILL_ANGLE_DEG };
  return base; // run
}

/** objects が空の EmbroideryDesign を生成する。fabric は参照をそのまま保持する。 */
export function createEmptyDesign(args: {
  widthMm: number;
  heightMm: number;
  fabric: FabricProfile;
}): EmbroideryDesign {
  return {
    widthMm: args.widthMm,
    heightMm: args.heightMm,
    fabric: args.fabric,
    objects: [],
  };
}
