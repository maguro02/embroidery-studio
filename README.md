# embroidery-studio

画像から刺繍ミシン用データ（DST/PES など）を自動生成し、ブラウザ上でステッチをプレビューするWebアプリ。

## 概要

| 機能 | 内容 |
|---|---|
| 入力 | PNG / JPEG / SVG（ロゴ・線画・アイコン向け） |
| 出力 | DST（タジマ） / PES（ブラザー） / JEF（ジャノメ） / SVG |
| プレビュー | ブラウザ上でステッチパス、色順、ジャンプステッチ、総ステッチ数を可視化 |

## アーキテクチャ

```
embroidery-studio/
├── frontend/   Next.js + TypeScript + Canvas/WebGL でプレビュー描画
├── backend/    FastAPI + pyembroidery + OpenCV/Pillow + potrace
└── docs/       設計メモ・パイプライン仕様
```

### 処理パイプライン

```
画像入力
  → 減色・量子化（糸色数へ近似）
  → 領域分割・輪郭抽出（OpenCV）
  → ベクター化（potrace）
  → ステッチタイプ割当（Satin / Fill / Run）
  → ステッチパス生成（密度・進入退出点・引き締まり補正）
  → pyembroidery で DST/PES 出力
```

## 技術スタック

### Frontend
- Next.js (App Router) / TypeScript
- Canvas または WebGL でステッチ描画
- ファイルアップロード、結果ダウンロード

### Backend
- Python 3.11+ / FastAPI
- [pyembroidery](https://github.com/EmbroidePy/pyembroidery) — 刺繍ファイル I/O
- OpenCV / Pillow / scikit-image — 画像処理
- pypotrace — ベクター化

## セットアップ

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## 現実的なスコープ

- ロゴ・モノクロ線画・アイコンなどシンプル画像に特化（MVP）
- 写真からの自動デジタイズは品質担保が難しく、対象外
- Ink/Stitch（GPLv3）のコード取り込みはライセンス影響に注意。APIで呼び出すのみとする

## ライセンス

未定。
