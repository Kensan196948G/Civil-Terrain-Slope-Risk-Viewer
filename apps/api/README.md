# 🌐 `@civil-terrain/api` — Cloudflare Workers バックエンド

地形傾斜リスク可視化システムの API。Cloudflare Workers (Web 標準ランタイム) 上で動作する。

## 📌 Sprint 0 スコープ

基盤のみ。全 12 エンドポイントのうち、稼働確認と共通基盤に絞って実装している。

| メソッド | パス                   | 説明                                        | 実装           |
| -------- | ---------------------- | ------------------------------------------- | -------------- |
| GET      | `/api/v1/health/live`  | プロセス生存確認 (依存先は見ない、常に 200) | ✅             |
| GET      | `/api/v1/health/ready` | 準備状態確認 (DB 設定チェック)              | ✅ (スタブ)    |
| —        | 他 10 エンドポイント   | 標高・分析・タイル等                        | ⏳ 後続 Sprint |

- **エラー応答**: すべて RFC 9457 (Problem Details, `application/problem+json`) 形式。`code`/`status` は `@civil-terrain/domain` の `ERROR_STATUS_MAP` で結合。
- **リクエスト ID**: 全応答に `x-request-id` ヘッダを付与し、エラー本体にも `requestId` を含める。

## 🗺️ 構成

```
src/
├── index.ts        Worker エントリ (fetch handler + 全体 try/catch → 500)
├── env.ts          Env / Hyperdrive / ExecutionContext 型 (Cloudflare 固有の最小定義)
├── http.ts         jsonResponse / problemResponse (共通レスポンス生成)
├── router.ts       パスベースの手動ルーティング (ROUTES テーブル)
└── routes/
    └── health.ts   /health/live, /health/ready ハンドラ
```

## ➕ エンドポイントの追加手順

1. `src/routes/<name>.ts` にハンドラ (`(context: RequestContext) => Response`) を作成。
2. `src/router.ts` の `ROUTES` テーブルに 1 行追加 (`{ method, path, handler }`)。
3. `src/routes/<name>.test.ts` に vitest で応答形状のテストを追加。

外部ルーティングライブラリ (Hono 等) は使わず、依存最小化 (Evidence First / Deterministic) の方針で手動分岐にしている。

## 🔧 開発コマンド

```bash
pnpm --filter @civil-terrain/api run typecheck   # tsc --noEmit
pnpm --filter @civil-terrain/api run test         # vitest run
pnpm --filter @civil-terrain/api run build        # tsc 出力 (型検証用)
```

> ⚠️ ローカル実行 (`wrangler dev`) / デプロイには wrangler CLI が必要。デプロイパイプライン整備時に devDependency として追加する (Sprint 0 では typecheck / test / lint のみ検証)。

## 🔐 バインディング

`src/env.ts` の `Env` が Worker のバインディング/シークレットを定義する。

| 名前                                      | 種別       | 用途                                 |
| ----------------------------------------- | ---------- | ------------------------------------ |
| `HYPERDRIVE`                              | Hyperdrive | Neon PostgreSQL への接続 (推奨経路)  |
| `DATABASE_URL`                            | Secret     | 直接接続文字列 (Hyperdrive 未使用時) |
| `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD` | Var        | Cloudflare Access JWT 検証用         |

`/health/ready` は `HYPERDRIVE.connectionString` を優先し、`@civil-terrain/db` の `loadDatabaseConfig` で構文検証する (Sprint 0 では実接続はしない)。
