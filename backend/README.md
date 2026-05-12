# backend

FastAPI による刺繍データ生成APIサーバー。

## エンドポイント（予定）

| Method | Path | 内容 |
|---|---|---|
| POST | `/api/convert` | 画像をアップロード → 刺繍データ生成（形式指定） |
| GET  | `/api/preview/{id}` | ステッチ座標列を JSON 返却（フロントの描画用） |
| GET  | `/api/download/{id}` | DST/PES などのバイナリを返却 |

## 構成（予定）

```
backend/
├── app/
│   ├── main.py            FastAPI エントリポイント
│   ├── routers/           ルーティング
│   ├── pipeline/          画像処理 → ベクター化 → ステッチ生成
│   │   ├── quantize.py    減色
│   │   ├── vectorize.py   potrace ラッパー
│   │   ├── stitch.py      Fill / Satin / Run の割当とパス生成
│   │   └── writer.py      pyembroidery 出力
│   └── models/            Pydantic スキーマ
└── tests/
```
