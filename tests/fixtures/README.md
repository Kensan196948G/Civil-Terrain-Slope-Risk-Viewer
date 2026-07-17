# 📌 tests/fixtures — ゴールデンDEMデータ (合成テストデータ)

工事候補地の標高・傾斜・地形分類の可視化ロジックを検証するための、**再現可能な固定テストデータセット**です。設計仕様書 14.3「ゴールデンデータ」に対応します。

## 🚨 最重要: これは合成データ (SYNTHETIC) です

> **本ディレクトリのDEMタイル・標高値・地形分類はすべて手作業で作成した合成データであり、国土地理院 (GSI) の実データではありません。**

- 実公開タイルを含まず、実データから派生してもいません。
- 各値は特定のデコード/傾斜/被覆パスを検証するために**意図的に選んだ人間可読な値**です（例: `12.50 m` 一様、列ごとに `+5.00 m` など）。
- 実データを騙るとテストの意味を誤解させるため、合成であることを明示しています。実タイルを用いた検証は「夜間の契約試験 (contract test)」に分離する方針です（設計仕様書 14.3）。

## 📋 出典・取得日・生成方法・利用可否

| 項目                     | 内容                                                                                           |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| 📄 出典 (source)         | SYNTHETIC — 本リポジトリ用に手作業で作成 (`tests/fixtures/generate/spec.ts`)                   |
| 📅 取得日 (generated at) | 2026-07-17                                                                                     |
| 🛠️ 生成方法              | `node tests/fixtures/generate/generate.ts`（Node 型ストリップ、ビルド不要）                    |
| 🔐 エンコード方式        | 国土地理院標高タイル形式（設計仕様書 8.2）: `x = 2^16 R + 2^8 G + B`、`h = signed(x) × 0.01 m` |
| ⛔ 無効値                | `x = 2^23`（RGB `128,0,0`）= no-data。負標高は正当な値として扱い欠損へ丸めない                 |
| ✅ 利用可否 / ライセンス | 本リポジトリのテスト内で自由に利用可。GSIタイルを含まず、派生もしていない合成データ            |

## 🗺️ ディレクトリ構成

```
tests/fixtures/
├── README.md                 このファイル
├── dem/                      合成 GSI形式 DEM PNGタイル (8×8, 8-bit RGB)
│   ├── 01-mountain.png       … 07-out-of-range.png
├── landform/
│   └── landform-samples.json 地形分類10正規化区分 + 境界サンプル
├── golden/                   期待出力（将来のテストの比較基準）
│   ├── elevations.json       意図標高グリッド + 被覆/最小/最大統計
│   ├── slopes.json           Horn法傾斜の解析的期待値
│   └── tiles.json            XYZタイル座標の期待値
├── generate/                 再実行可能な生成ロジック (TypeScript)
│   ├── png.ts                標準zlib + CRC32のみのPNG encode/decode
│   ├── dem-encode.ts         encodeElevation（decodeElevationの逆関数）
│   ├── spec.ts               全fixtureの定義（真実の源）
│   └── generate.ts           生成スクリプト
├── golden.test.ts            検証テスト（round-trip・傾斜・タイル）
└── vitest.config.ts          このディレクトリ専用のVitestプロジェクト設定
```

## 🏔️ DEM代表7地点（設計仕様書 14.3）

各タイルは 8×8 の小さな合成タイルです。`representativePoint` の緯度経度は**文脈用の出典情報**であり、その地点の実地形を表すものではありません。

| #   | ファイル              | 区分         | 内容                                | 検証観点                                             |
| --- | --------------------- | ------------ | ----------------------------------- | ---------------------------------------------------- |
| 01  | `01-mountain.png`     | 山地         | 1200.00〜1235.00 m、列ごと +5.00 m  | 高標高・既知勾配 (内部3×3で東傾斜 atan(0.5)=26.565°) |
| 02  | `02-plain.png`        | 平地         | 一様 12.50 m                        | 傾斜 0.000°・被覆 FULL                               |
| 03  | `03-lowland.png`      | 低地         | 2.00〜2.70 m、行ごと +0.10 m        | 低標高・緩傾斜 (南傾斜 atan(0.01)=0.573°)            |
| 04  | `04-negative.png`     | 負標高       | 一様 -3.50 m                        | 負標高を欠損へ丸めない (spec 8.2)                    |
| 05  | `05-coast.png`        | 海岸         | -2.00〜+5.00 m、`c=2` で厳密 0.00 m | 負・ゼロ・正を1枚で網羅 (UT-DEM-01)                  |
| 06  | `06-boundary.png`     | DEM境界      | 左半分 8.00 m / 右半分 no-data      | 被覆 PARTIAL・null隣接の傾斜は null                  |
| 07  | `07-out-of-range.png` | データ範囲外 | 全セル no-data                      | 被覆 NONE（Unknown is not Safe: 低品質と混同しない） |

## 🧭 地形分類 10正規化区分（設計仕様書 8.5）

`landform/landform-samples.json` に、各正規化区分1件ずつのサンプルと、境界サンプル（単一区分へ断定せず交差する全分類と距離を提示）を収録。フィールドは spec 8.5 準拠: `originalCode` / `normalizedClass` / `sourceDataset` / `sourceDate` / `description`。

`MOUNTAIN_SLOPE` / `CLIFF_TERRACE_CLIFF` / `LANDSLIDE` / `DEPRESSION_SHALLOW_VALLEY` / `FLOODPLAIN_COASTAL_PLAIN` / `BACK_MARSH` / `FORMER_RIVER_CHANNEL` / `VALLEY_PLAIN` / `ARTIFICIAL_FILL` / `OTHER`

> ⚠️ `packages/domain` には現時点で地形分類の型が未定義です。本fixtureが正規化区分の一次情報を兼ねます。将来 `packages/domain` に `NormalizedLandformClass` 型を追加する際は、`generate/spec.ts` の `NORMALIZED_LANDFORM_CLASSES` と整合させてください。

## ▶️ 再生成と検証

```bash
# 再生成（決定的・冪等。再実行しても差分は出ない）
pnpm fixtures:generate            # = node tests/fixtures/generate/generate.ts

# 検証テスト（PNGを実際に decodeElevation で読み戻し、意図標高と一致することを確認）
pnpm test                         # ルートworkspaceの一部として全パッケージと一括実行
pnpm fixtures:test                # このfixtureのみ単独実行（= vitest run --config tests/fixtures/vitest.config.ts）
pnpm fixtures:typecheck           # このfixtureのみ型チェック（= tsc --noEmit -p tests/fixtures/tsconfig.json）
```

### 🧪 検証テストの内容 (`golden.test.ts`)

| ブロック           | 検証内容                                                                                                                                |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| DEM round-trip     | 各PNGを `decodePng` → `@civil-terrain/geo` の `decodeElevation` で読み戻し、`golden/elevations.json` の意図標高と一致（no-data も含む） |
| encode/decode 恒等 | `encodeElevation` が `decodeElevation` の厳密な逆関数であること（0・±0.01・±83886.07・no-data・範囲外throw）                            |
| 傾斜ゴールデン     | `calculateSlopeDeg` の出力が `golden/slopes.json` の解析的期待値と一致                                                                  |
| タイルゴールデン   | `lonLatToTileXY` の出力が `golden/tiles.json` と一致 + 高緯度クランプの発動                                                             |

> 💡 傾斜・標高の期待値は**実装の出力スナップショットではなく解析的に導出した独立の真実**です。これにより、実装にバグがあっても「自分の出力」で検証してしまう循環を避けています。

## ⚙️ 設計上の判断メモ

- **PNG生成**: 依存を増やさない方針に従い、Node標準の `zlib`（deflate/inflate）と自前のCRC32のみでPNGのchunk構造 (IHDR/IDAT/IEND) を構築（`generate/png.ts`）。外部PNGライブラリは不使用。
- **JSON整形**: 生成物が `prettier --check` を通るよう、生成スクリプトが出力JSONを Prettier で整形して書き出します（生成物を `.prettierignore` に追加する必要をなくすため。生成は冪等）。
- **`encodeElevation` の所在**: round-trip検証を意味あるものにするため、生成と検証で**同一の** `encodeElevation` を共有（`generate/dem-encode.ts`）。テストへの inline 複製はしていません。
- **Vitestワークスペース**: 本fixtureはルート `vitest.workspace.ts`（`["packages/*", "apps/*", "tests/fixtures"]`）へ統合済みで、既定の `pnpm test` でも実行されます（`vitest.config.ts` がそのプロジェクト設定）。ルート `package.json` に `fixtures:generate` / `fixtures:test` / `fixtures:typecheck` を用意し、`typecheck` にも fixtures の型チェックを組み込み済みです。単独実行が必要なときのみ `fixtures:*` を使います。
