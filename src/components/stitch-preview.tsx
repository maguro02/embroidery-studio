"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";

type Props = {
  imageSrc: string | null;
  isProcessing: boolean;
};

export function StitchPreview({ imageSrc, isProcessing }: Props) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base">プレビュー</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="stitch">
          <TabsList>
            <TabsTrigger value="source">元画像</TabsTrigger>
            <TabsTrigger value="vector">ベクター</TabsTrigger>
            <TabsTrigger value="stitch">ステッチ</TabsTrigger>
            <TabsTrigger value="3d">3D</TabsTrigger>
          </TabsList>

          <TabsContent value="source">
            <PreviewSurface>
              {imageSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageSrc}
                  alt="source"
                  className="max-h-[480px] object-contain"
                />
              ) : (
                <EmptyState text="左のパネルから画像を読み込んでください" />
              )}
            </PreviewSurface>
          </TabsContent>

          <TabsContent value="vector">
            <PreviewSurface>
              <EmptyState text="ベクター化結果はここに表示されます (potrace-wasm)" />
            </PreviewSurface>
          </TabsContent>

          <TabsContent value="stitch">
            <PreviewSurface>
              {isProcessing ? (
                <div className="flex flex-col items-center gap-3 text-muted-foreground">
                  <Loader2 className="size-6 animate-spin" />
                  <span className="text-sm">ステッチ生成中...</span>
                </div>
              ) : (
                <EmptyState text="ステッチパスはここに描画されます (Canvas)" />
              )}
            </PreviewSurface>
          </TabsContent>

          <TabsContent value="3d">
            <PreviewSurface>
              <EmptyState text="three.js による糸シミュレーション (将来対応)" />
            </PreviewSurface>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function PreviewSurface({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 flex h-[480px] items-center justify-center rounded-md border bg-muted/30">
      {children}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>;
}
