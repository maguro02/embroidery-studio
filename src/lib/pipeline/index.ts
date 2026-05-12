import type { StitchPattern } from "./types";
import type { ConversionConfig } from "@/components/embroidery-studio";
import { getPyodide } from "./pyodide-loader";
import { getOpenCV } from "./opencv-loader";
import { quantize } from "./quantize";
import { vectorize } from "./vectorize";
import { generateStitches } from "./stitch";
import { writeEmbroidery } from "./writer";

export type PipelineStage =
  | "loading-cv"
  | "loading-py"
  | "quantize"
  | "vectorize"
  | "stitch"
  | "write";

export type PipelineProgress = {
  stage: PipelineStage;
  percent: number;
  message?: string;
};

export type PipelineResult = {
  pattern: StitchPattern;
  fileBlob: Blob;
};

/** OpenCV.js のメモリ消費を抑えるため、k-means の入力解像度を絞る */
const MAX_DIMENSION = 384;

/**
 * Worker を経由せずに各ステージを直接実行する版。
 * 主にユニット検証・E2E デバッグ用。実プロダクトは Worker 経由を推奨。
 */
export async function convertImageToEmbroideryDirect(
  imageBitmap: ImageBitmap,
  config: ConversionConfig,
  onProgress?: (p: PipelineProgress) => void,
): Promise<PipelineResult> {
  onProgress?.({ stage: "loading-cv", percent: 5 });
  const cv = await getOpenCV();

  onProgress?.({ stage: "loading-py", percent: 15 });
  const py = await getPyodide();

  const imageData = bitmapToImageData(imageBitmap);
  const aspect = imageBitmap.height / imageBitmap.width;
  const widthMm = config.widthMm;
  const heightMm = widthMm * aspect;

  onProgress?.({ stage: "quantize", percent: 25 });
  const quantized = await quantize(cv, {
    imageData,
    colorCount: config.colorCount,
  });

  onProgress?.({ stage: "vectorize", percent: 50 });
  const regions = await vectorize({
    labels: quantized.labels,
    width: imageData.width,
    height: imageData.height,
    palette: quantized.palette,
  });

  onProgress?.({ stage: "stitch", percent: 75 });
  const pattern = generateStitches({
    regions,
    widthMm,
    heightMm,
    widthPx: imageData.width,
    heightPx: imageData.height,
    stitchDensityMm: config.stitchDensity,
    satinMaxWidthMm: config.satinMaxWidthMm,
  });

  onProgress?.({ stage: "write", percent: 90 });
  const fileBlob = await writeEmbroidery(py, {
    pattern,
    format: config.format,
  });

  return { pattern, fileBlob };
}

/** 巨大画像を最大辺 MAX_DIMENSION に縮小して ImageData 化 */
function bitmapToImageData(bitmap: ImageBitmap): ImageData {
  const { width: w, height: h } = bitmap;
  const scale = Math.min(1, MAX_DIMENSION / Math.max(w, h));
  const dw = Math.max(1, Math.round(w * scale));
  const dh = Math.max(1, Math.round(h * scale));
  const canvas =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(dw, dh)
      : Object.assign(document.createElement("canvas"), {
          width: dw,
          height: dh,
        });
  const ctx = canvas.getContext("2d") as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null;
  if (!ctx) throw new Error("Canvas 2D コンテキストを取得できません");
  ctx.drawImage(bitmap, 0, 0, dw, dh);
  return ctx.getImageData(0, 0, dw, dh);
}
