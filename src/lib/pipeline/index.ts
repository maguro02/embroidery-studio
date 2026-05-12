import type { StitchPattern } from "./types";
import type { ConversionConfig } from "@/components/embroidery-studio";
import { getPyodide } from "./pyodide-loader";
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
 * OpenCV.js / esm-potrace-wasm のメモリ消費を抑えるため入力解像度を絞る。
 * esm-potrace-wasm は大きい画像で WASM heap が枯渇し
 * "memory access out of bounds" になる (upstream issue #8)。
 */
const MAX_DIMENSION = 256;

/**
 * 画像 → 刺繍データの変換パイプライン。
 * - OpenCV.js は Web Worker で動かす (メインスレッドを巻き込んだクラッシュを防ぐ)
 * - Pyodide はメインスレッドで動かす (pyembroidery 出力)
 * - potrace (ESM) もメインスレッドで動かす
 */
export async function convertImageToEmbroideryDirect(
  imageBitmap: ImageBitmap,
  config: ConversionConfig,
  onProgress?: (p: PipelineProgress) => void,
): Promise<PipelineResult> {
  onProgress?.({ stage: "loading-cv", percent: 5 });
  await warmupOpenCV();

  onProgress?.({ stage: "loading-py", percent: 15 });
  const py = await getPyodide();

  const imageData = bitmapToImageData(imageBitmap);
  const aspect = imageBitmap.height / imageBitmap.width;
  const widthMm = config.widthMm;
  const heightMm = widthMm * aspect;

  onProgress?.({ stage: "quantize", percent: 25 });
  const quantized = await quantize({
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
