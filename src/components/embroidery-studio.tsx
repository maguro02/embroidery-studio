"use client";

import { useState } from "react";
import { ImageUploader } from "@/components/image-uploader";
import { ConversionSettings } from "@/components/conversion-settings";
import { StitchPreview } from "@/components/stitch-preview";
import { ResultPanel } from "@/components/result-panel";

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

export function EmbroideryStudio() {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [config, setConfig] = useState<ConversionConfig>(defaultConfig);
  const [isProcessing, setIsProcessing] = useState(false);
  const [stitchResult] = useState<null | {
    stitchCount: number;
    colorCount: number;
    fileBlob: Blob;
  }>(null);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr_320px]">
      <aside className="flex flex-col gap-6">
        <ImageUploader onImage={setImageSrc} />
        <ConversionSettings
          value={config}
          onChange={setConfig}
          disabled={!imageSrc || isProcessing}
          onConvert={() => {
            setIsProcessing(true);
            // TODO: WASM パイプラインを呼び出す
            setTimeout(() => setIsProcessing(false), 500);
          }}
        />
      </aside>

      <section className="min-h-[520px]">
        <StitchPreview imageSrc={imageSrc} isProcessing={isProcessing} />
      </section>

      <aside>
        <ResultPanel result={stitchResult} format={config.format} />
      </aside>
    </div>
  );
}
