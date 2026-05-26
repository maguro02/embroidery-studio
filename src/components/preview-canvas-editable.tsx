"use client";

// preview-canvas-editable.tsx — Phase 5 PR20 編集対応プレビュー。
//
// 既存 StitchCanvas (stitch-preview.tsx) を内部利用しつつ、上層に「クリック選択」
// 用のオーバーレイ canvas を重ねる。クリック時に hit-test → designStore に
// selectedObjectId を保存。選択中 object の outer をハイライト描画する。
//
// 本 PR ではノード編集 / ペンモードは扱わない (PR23 以降)。

import { useEffect, useMemo, useRef } from "react";
import { StitchCanvas } from "./stitch-preview";
import { hitTestObject } from "./hit-test";
import { useDesignStore } from "./design-store";
import type {
  EmbroideryDesign,
  Point2D,
  StitchPattern,
} from "@/lib/pipeline/types";

type Props = {
  /** stitch 描画用 (既存 StitchCanvas に渡す) */
  pattern: StitchPattern;
  /** クリックヒットテスト用 (object の outer を持つ design) */
  design: EmbroideryDesign | null;
};

export function PreviewCanvasEditable({ pattern, design }: Props) {
  const selectedObjectId = useDesignStore((s) => s.selectedObjectId);
  const setSelectedObjectId = useDesignStore((s) => s.setSelectedObjectId);

  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  const scale = useMemo(
    () => Math.min(480 / pattern.widthMm, 480 / pattern.heightMm),
    [pattern.widthMm, pattern.heightMm],
  );
  const w = Math.max(1, Math.round(pattern.widthMm * scale));
  const h = Math.max(1, Math.round(pattern.heightMm * scale));

  // オーバーレイ (選択ハイライト)
  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    ctx.clearRect(0, 0, pattern.widthMm, pattern.heightMm);

    if (!design || !selectedObjectId) return;
    const obj = design.objects.find((o) => o.id === selectedObjectId);
    if (!obj) return;

    ctx.strokeStyle = "rgba(56, 189, 248, 0.95)"; // sky-400
    ctx.lineWidth = 1.5 / scale;
    ctx.beginPath();
    const outer = obj.shape.outer;
    if (outer.length === 0) return;
    ctx.moveTo(outer[0][0], outer[0][1]);
    for (let i = 1; i < outer.length; i++) {
      ctx.lineTo(outer[i][0], outer[i][1]);
    }
    ctx.closePath();
    ctx.stroke();
  }, [pattern, w, h, scale, design, selectedObjectId]);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!design) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const xPx = e.clientX - rect.left;
    const yPx = e.clientY - rect.top;
    // px → mm
    const pt: Point2D = [xPx / scale, yPx / scale];
    const id = hitTestObject(design, pt);
    setSelectedObjectId(id);
  };

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      className="relative cursor-crosshair"
      style={{ width: w, height: h }}
    >
      <StitchCanvas pattern={pattern} />
      <canvas
        ref={overlayRef}
        className="pointer-events-none absolute left-0 top-0"
      />
    </div>
  );
}
