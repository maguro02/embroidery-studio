"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Sparkles } from "lucide-react";
import type {
  ConversionConfig,
  EmbroideryFormat,
} from "@/components/embroidery-studio";

type Props = {
  value: ConversionConfig;
  onChange: (v: ConversionConfig) => void;
  disabled: boolean;
  onConvert: () => void;
};

const FORMATS: { value: EmbroideryFormat; label: string }[] = [
  { value: "dst", label: "DST (Tajima)" },
  { value: "pes", label: "PES (Brother)" },
  { value: "jef", label: "JEF (Janome)" },
  { value: "exp", label: "EXP (Melco)" },
  { value: "vp3", label: "VP3 (Husqvarna)" },
];

export function ConversionSettings({
  value,
  onChange,
  disabled,
  onConvert,
}: Props) {
  const update = <K extends keyof ConversionConfig>(
    key: K,
    v: ConversionConfig[K],
  ) => onChange({ ...value, [key]: v });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">2. パラメータを調整</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label>出力フォーマット</Label>
          <Select
            value={value.format}
            onValueChange={(v) => update("format", v as EmbroideryFormat)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FORMATS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <SliderField
          label="幅"
          unit="mm"
          value={value.widthMm}
          min={20}
          max={300}
          step={1}
          onChange={(v) => update("widthMm", v)}
        />
        <SliderField
          label="色数"
          unit="色"
          value={value.colorCount}
          min={1}
          max={16}
          step={1}
          onChange={(v) => update("colorCount", v)}
        />
        <SliderField
          label="ステッチ密度"
          unit="mm"
          value={value.stitchDensity}
          min={0.2}
          max={1.0}
          step={0.05}
          onChange={(v) => update("stitchDensity", v)}
        />
        <SliderField
          label="サテン最大幅"
          unit="mm"
          value={value.satinMaxWidthMm}
          min={1}
          max={12}
          step={0.5}
          onChange={(v) => update("satinMaxWidthMm", v)}
        />
        <SliderField
          label="平滑化"
          unit=""
          value={value.smoothing}
          min={0}
          max={4}
          step={1}
          onChange={(v) => update("smoothing", v)}
        />

        <Button
          className="w-full"
          onClick={onConvert}
          disabled={disabled}
        >
          {disabled ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              処理中
            </>
          ) : (
            <>
              <Sparkles className="size-4" />
              刺繍データを生成
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className="text-xs tabular-nums text-muted-foreground">
          {value}
          {unit}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => {
          if (Array.isArray(v) && typeof v[0] === "number") onChange(v[0]);
        }}
      />
    </div>
  );
}
