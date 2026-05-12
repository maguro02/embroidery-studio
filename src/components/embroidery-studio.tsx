"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ImageUploader } from "@/components/image-uploader";
import { ConversionSettings } from "@/components/conversion-settings";
import { StitchPreview } from "@/components/stitch-preview";
import { ResultPanel } from "@/components/result-panel";
import {
  convertImageToEmbroideryDirect,
  type PipelineProgress,
} from "@/lib/pipeline";
import type { StitchPattern } from "@/lib/pipeline/types";

export type EmbroideryFormat = "dst" | "pes" | "jef" | "exp" | "vp3";

export type ConversionConfig = {
  format: EmbroideryFormat;
  widthMm: number;
  colorCount: number;
  stitchDensity: number;
  satinMaxWidthMm: number;
  smoothing: number;
};

export const defaultConfig: ConversionConfig = {
  format: "dst",
  widthMm: 100,
  colorCount: 6,
  stitchDensity: 0.4,
  satinMaxWidthMm: 5,
  smoothing: 1,
};

type StitchResult = {
  stitchCount: number;
  colorCount: number;
  fileBlob: Blob;
};

export function EmbroideryStudio() {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [config, setConfig] = useState<ConversionConfig>(defaultConfig);
  const [isProcessing, setIsProcessing] = useState(false);
  const [stitchResult, setStitchResult] = useState<StitchResult | null>(null);
  const [pattern, setPattern] = useState<StitchPattern | null>(null);
  const [progress, setProgress] = useState<PipelineProgress | null>(null);

  const onImage = (src: string | null) => {
    setImageSrc(src);
    setStitchResult(null);
    setPattern(null);
    setProgress(null);
  };

  const onConvert = async () => {
    if (!imageSrc) return;
    setIsProcessing(true);
    setProgress({ stage: "loading-cv", percent: 0 });
    try {
      const blob = await (await fetch(imageSrc)).blob();
      const bitmap = await createImageBitmap(blob);
      const { pattern: pat, fileBlob } = await convertImageToEmbroideryDirect(
        bitmap,
        config,
        (p) => setProgress(p),
      );
      setPattern(pat);
      setStitchResult({
        stitchCount: pat.totalStitches,
        colorCount: pat.blocks.length,
        fileBlob,
      });
      toast.success(
        `生成完了: ${pat.totalStitches.toLocaleString()} ステッチ`,
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(`変換失敗: ${message}`);
      console.error(e);
    } finally {
      setIsProcessing(false);
      setProgress(null);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr_320px]">
      <aside className="flex flex-col gap-6">
        <ImageUploader onImage={onImage} />
        <ConversionSettings
          value={config}
          onChange={setConfig}
          disabled={!imageSrc || isProcessing}
          onConvert={onConvert}
        />
      </aside>

      <section className="min-h-[520px]">
        <StitchPreview
          imageSrc={imageSrc}
          isProcessing={isProcessing}
          pattern={pattern}
          progress={progress}
        />
      </section>

      <aside>
        <ResultPanel result={stitchResult} format={config.format} />
      </aside>
    </div>
  );
}
