import type { StitchPattern } from "./types";
import type { ConversionConfig } from "@/components/embroidery-studio";
import { warmupPyodide } from "./pyodide-loader";
import { quantize, warmupOpenCV } from "./quantize";
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

/**
 * OpenCV.js のメモリ消費と imagetracerjs の処理時間を抑えるため入力解像度を絞る。
 * 必要なら段階的に上げる。
 */
const MAX_DIMENSION = 384;

/**
 * 画像 → 刺繍データの変換パイプライン。
 * - OpenCV.js は Web Worker で動かす (opencv-worker.ts)
 * - Pyodide も Web Worker で動かす (pyodide-worker.ts)
 * - imagetracerjs (pure JS) はメインスレッドで動かす
 */
export async function convertImageToEmbroideryDirect(
  imageBitmap: ImageBitmap,
  config: ConversionConfig,
  onProgress?: (p: PipelineProgress) => void,
): Promise<PipelineResult> {
  onProgress?.({ stage: "loading-cv", percent: 5 });
  await warmupOpenCV();

  onProgress?.({ stage: "loading-py", percent: 15 });
  await warmupPyodide();

  const { imageData, opaqueMask } = bitmapToImageData(imageBitmap);
  const aspect = imageBitmap.height / imageBitmap.width;
  const widthMm = config.widthMm;
  const heightMm = widthMm * aspect;

  onProgress?.({ stage: "quantize", percent: 25 });
  const quantized = await quantize({
    imageData,
    opaqueMask,
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
  const fileBlob = await writeEmbroidery({
    pattern,
    format: config.format,
  });

  return { pattern, fileBlob };
}

function bitmapToImageData(bitmap: ImageBitmap): {
  imageData: ImageData;
  /** 1 = 不透明 (ステッチ対象)、0 = 透明 (背景としてステッチ対象外) */
  opaqueMask: Uint8Array;
} {
  const { width: w, height: h } = bitmap;
  const scale = Math.min(1, MAX_DIMENSION / Math.max(w, h));
  const dw = Math.max(1, Math.round(w * scale));
  const dh = Math.max(1, Math.round(h * scale));

  // 1) 白で塗りつぶしてから drawImage。透過部分の RGB を (0,0,0,0) ではなく白に統一する。
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
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, dw, dh);
  ctx.drawImage(bitmap, 0, 0, dw, dh);
  const imageData = ctx.getImageData(0, 0, dw, dh);

  // 2) アルファだけを別 canvas で取得して背景マスクを作る。
  //    白合成後の imageData では alpha が常に 255 になるため、別取りが必要。
  const maskCanvas =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(dw, dh)
      : Object.assign(document.createElement("canvas"), {
          width: dw,
          height: dh,
        });
  const mctx = maskCanvas.getContext("2d") as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null;
  if (!mctx) throw new Error("Canvas 2D コンテキスト (mask) を取得できません");
  mctx.clearRect(0, 0, dw, dh);
  mctx.drawImage(bitmap, 0, 0, dw, dh);
  const maskData = mctx.getImageData(0, 0, dw, dh).data;
  const opaqueMask = new Uint8Array(dw * dh);
  for (let i = 0; i < dw * dh; i++) {
    opaqueMask[i] = maskData[i * 4 + 3] >= 128 ? 1 : 0;
  }
  return { imageData, opaqueMask };
}
