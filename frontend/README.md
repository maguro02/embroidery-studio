# frontend

Next.js による刺繍プレビューUI。

## 初期化（未実施）

```bash
npx create-next-app@latest . --typescript --app --eslint --tailwind --src-dir --import-alias "@/*"
```

## 画面（予定）

1. **アップロード画面** — 画像をドロップ、出力形式（DST/PES/JEF）・色数・サイズを指定
2. **プレビュー画面** — Canvas にステッチパスを描画、色順スライダー、ジャンプステッチ表示切替、総ステッチ数表示
3. **ダウンロード** — バックエンドが返したファイルを取得

## プレビュー描画方針

- まずは 2D Canvas でステッチライン描画
- 将来的に WebGL（three.js）で糸の陰影・布テクスチャを再現
