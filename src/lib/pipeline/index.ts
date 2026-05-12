/**
 * 画像 → 刺繍データのパイプラインのエントリポイント。
 * 各ステージは段階的に実装する。
 */

import type { StitchPattern } from "./types";
import type { ConversionConfig } from "@/components/embroidery-studio";

export type PipelineProgress = {
  stage: "quantize" | "vectorize" | "stitch" | "write";
  percent: number;
};

export async function convertImageToEmbroidery(
  imageBitmap: ImageBitmap,
  config: ConversionConfig,
  onProgress?: (p: PipelineProgress) => void,
): Promise<{ pattern: StitchPattern; fileBlob: Blob }> {
  // 1. 量子化（OpenCV.js）
  onProgress?.({ stage: "quantize", percent: 10 });
  // TODO: k-means quantization

  // 2. ベクター化（potrace-wasm）
  onProgress?.({ stage: "vectorize", percent: 30 });
  // TODO: trace per color mask

  // 3. ステッチパス生成（TypeScript）
  onProgress?.({ stage: "stitch", percent: 60 });
  // TODO: assign satin / fill / run, generate stitches

  // 4. 刺繍ファイル書き出し（Pyodide + pyembroidery）
  onProgress?.({ stage: "write", percent: 90 });
  // TODO: feed stitches into pyembroidery EmbPattern and dump bytes

  void imageBitmap;
  void config;

  throw new Error("Pipeline not yet implemented");
}
