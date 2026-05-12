# embroidery-studio

画像から刺繍ミシン用データ (DST / PES / JEF / EXP / VP3) を生成し、ブラウザ上でステッチをプレビューする **完全クライアントサイド** のWebアプリ。サーバーへの画像送信は一切なし。

## 特徴

- 100% client-side — Next.js `output: "export"` の静的ホスティングで動作（CDN配信可）
- WASM ベースの画像処理パイプライン
- shadcn/ui + Tailwind v4 によるUI

## 技術スタック

| 層 | 採用 |
|---|---|
| Frontend | Next.js 16 (App Router) / React 19 / TypeScript |
| Style | Tailwind CSS v4 / shadcn/ui |
| 画像処理 | OpenCV.js (WASM, CDN) |
| ベクター化 | [esm-potrace-wasm](https://github.com/tomayac/esm-potrace-wasm) |
| ステッチ生成 | 自前 TypeScript 実装（Run / Satin / Fill） |
| 刺繍ファイル出力 | Pyodide + [pyembroidery](https://github.com/EmbroidePy/pyembroidery) |
| プレビュー | Canvas 2D / three.js（3D） |

### なぜブラウザだけで完結できるか
- **pyembroidery は pure Python** で C 拡張・依存なし → Pyodide 上でそのまま動作
- **OpenCV.js** が WASM で配布されており、量子化・輪郭抽出が可能
- **esm-potrace-wasm** がブラウザ向けの potrace を提供

## 処理パイプライン

```
画像入力
  → 減色 (k-means, OpenCV.js)
  → 領域分割・輪郭抽出 (OpenCV.js)
  → ベクター化 (esm-potrace-wasm)
  → ステッチタイプ割当 (TS: Satin / Fill / Run)
  → ステッチパス生成 (TS)
  → DST/PES 等出力 (Pyodide + pyembroidery)
```

詳細は [`docs/pipeline.md`](./docs/pipeline.md) を参照。

## セットアップ

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # ./out に静的ファイルを書き出し
```

## ディレクトリ構成

```
src/
├── app/                    Next.js App Router
├── components/
│   ├── ui/                 shadcn/ui コンポーネント
│   ├── embroidery-studio.tsx
│   ├── image-uploader.tsx
│   ├── conversion-settings.tsx
│   ├── stitch-preview.tsx       Canvas2D + 3Dタブ
│   ├── stitch-preview-3d.tsx    three.js 糸シミュレーション
│   └── result-panel.tsx
├── lib/
│   ├── pipeline/
│   │   ├── index.ts            convertImageToEmbroideryDirect
│   │   ├── pyodide-loader.ts
│   │   ├── opencv-loader.ts
│   │   ├── quantize.ts         OpenCV.js k-means
│   │   ├── vectorize.ts        esm-potrace-wasm + SVGパーサ
│   │   ├── stitch.ts           Run/Satin/Fill 自動判定
│   │   ├── writer.ts           Pyodide + pyembroidery
│   │   ├── units.ts
│   │   └── types.ts
│   └── utils.ts
docs/
└── pipeline.md             パイプライン仕様ドラフト
```

## ライセンス上の注意

- **`esm-potrace-wasm` は GPL-2.0** (Potrace 由来)。npm 依存として動的に呼び出すのみとし、ソースコードの改変・取り込みは行わない。SVGcode で採用されているのと同じ運用。
- Ink/Stitch (GPLv3) のコード取り込みも行わない。pyembroidery (MIT) のみコード参照可。
- 配布時は README / NOTICE に GPL 依存である旨を明記する。

## 既知の制約 / 未対応

- **Web Worker 化は未実装**: `esm-potrace-wasm` (ESM 専用) と Pyodide/OpenCV.js (classic script) の混在で Worker 統合に追加検討が必要。当面はメインスレッドで実行するため、生成中はブラウザ操作が一時的に重くなる。
- DMC 等の糸色パレット近似は未対応 (任意 RGB のまま `add_thread`)
- pull compensation / underlay は未対応

## スコープ

- 対象: ロゴ / 線画 / アイコンなどシンプルな図形
- 非対象: 写真からの自動デジタイズ（品質が安定しない）
