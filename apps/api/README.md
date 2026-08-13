# 🌐 `@civil-terrain/api` — Cloudflare Workers バックエンド

地形傾斜リスク可視化システムの API。Cloudflare Workers (Web 標準ランタイム) 上で動作する。

## 📌 MVP スコープ

Workers API は現在のMVPで使う公開メタ情報・標高取得・ヘルスチェックを実装済み。
DB永続化が必要な分析保存APIはNeon接続後のSprint 3+対象。

| メソッド | パス                           | 説明                              | 実装                        |
| -------- | ------------------------------ | --------------------------------- | --------------------------- |
| GET      | `/api/v1/health/live`          | プロセス生存確認                  | ✅                          |
| GET      | `/api/v1/health/ready`         | DB設定確認。DB未接続なら503を返す | ✅ (実接続確認はNeon接続後) |
| GET      | `/api/v1/elevation`            | GSI DEMタイルから単点標高を取得   | ✅                          |
| GET      | `/api/v1/capabilities`         | 実装済み機能の正直な列挙          | ✅                          |
| GET      | `/api/v1/sources`              | 利用データソースと帰属            | ✅                          |
| —        | 分析保存・管理系エンドポイント | Neon永続化、監査DB保存、管理操作  | ⏳ 後続 Sprint              |

- **エラー応答**: すべて RFC 9457 (Problem Details, `application/problem+json`) 形式。`code`/`status` は `@civil-terrain/domain` の `ERROR_STATUS_MAP` で結合。
- **リクエスト ID**: 全応答に `x-request-id` ヘッダを付与し、エラー本体にも `requestId` を含める。

## 🗺️ 構成

```
src/
├── index.ts        Worker エントリ (fetch handler + 全体 try/catch → 500)
├── env.ts          Env / Hyperdrive / ExecutionContext 型 (Cloudflare 固有の最小定義)
├── http.ts         jsonResponse / problemResponse (共通レスポンス生成)
├── router.ts       パスベースの手動ルーティング (ROUTES テーブル)
├── routes/         health / elevation / capabilities / sources
├── security/       Access JWT / RBAC / rate limit
└── observability.ts 構造化監査ログ
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

> ⚠️ ローカル実行 (`wrangler dev`) / デプロイには wrangler CLI が必要です。依存関係に含まれているため `pnpm --filter @civil-terrain/api run dev` で起動できます。

## 🔐 バインディング

`src/env.ts` の `Env` が Worker のバインディング/シークレットを定義する。

| 名前                                      | 種別       | 用途                                                  |
| ----------------------------------------- | ---------- | ----------------------------------------------------- |
| `HYPERDRIVE`                              | Hyperdrive | Neon PostgreSQL への接続 (推奨経路)                   |
| `DATABASE_URL`                            | Secret     | 直接接続文字列 (Hyperdrive 未使用時)                  |
| `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD` | Var        | Cloudflare Access JWT 検証用。片方欠けは保護ルート503 |
| `CF_ACCESS_*_GROUPS`                      | Var        | RBAC用Cloudflare Access Group ID                      |
| `RATE_LIMIT_PER_MINUTE`                   | Var        | IP単位のAPIレート制限                                 |

`/health/ready` は `HYPERDRIVE.connectionString` を優先し、`@civil-terrain/db` の `loadDatabaseConfig` で構文検証する (Sprint 0 では実接続はしない)。
