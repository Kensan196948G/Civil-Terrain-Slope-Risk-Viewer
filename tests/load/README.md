# 負荷テスト手順 (2026-08-12)

## 目的

Cloudflare Workers 上で公開API (`/health/live`, `/capabilities`, `/elevation`) の
応答時間とレート制限動作を実測する。本番カスタムドメインは Cloudflare Access で
保護されているため、**別名の一時Worker** (`civil-terrain-api-loadtest`) を
workers.dev サブドメインへデプロイして計測する。

## 手順

```bash
# 1) 一時Workerをデプロイ (URLは出力される)
pnpm --filter @civil-terrain/api exec wrangler deploy -c wrangler.loadtest.toml

# 2) 生存確認
curl -s https://<name>.<subdomain>.workers.dev/api/v1/health/live

# 3) 通常負荷のレイテンシ計測 (n=100, c=10。Rate Limit 120/分/IP を下回る)
ab -n 100 -c 10 https://<name>.<subdomain>.workers.dev/api/v1/health/live
ab -n 100 -c 10 https://<name>.<subdomain>.workers.dev/api/v1/capabilities

# 4) 実データ経路の健全性 (1リクエストのみ。GSI 上流への過負荷を避ける)
curl -s "https://<name>.<subdomain>.workers.dev/api/v1/elevation?lat=35.68&lon=139.76"

# 5) レート制限の動作確認 (300リクエスト。429 の混入を確認)
ab -n 300 -c 30 https://<name>.<subdomain>.workers.dev/api/v1/health/live

# 6) 後片付け (必ず実行)
pnpm --filter @civil-terrain/api exec wrangler delete --name civil-terrain-api-loadtest
```

## 2026-08-12 実測結果 (GitHub Actions とは別のローカル計測)

対象: 一時Worker `civil-terrain-api-loadtest` (workers.dev、Access外)。

| 対象              | 条件                | 結果                                        |
| ----------------- | ------------------- | ------------------------------------------- |
| GET /health/live  | 100 req / c=10      | 200:100、p50=62ms / p95=512ms / p99=854ms   |
| GET /capabilities | 100 req / c=10      | 200:100、p50=53ms / p95=990ms / p99=1061ms  |
| GET /health/live  | 300 req / c=30      | 200:300、p50=79ms / p95=1213ms / p99=1222ms |
| GET /elevation    | 1 req (GSI実データ) | 200、DEM5A 3.01m、品質A・FULL、出典付き     |

デプロイ直後の最初の計測では 404/500 が混在したが、デプロイ伝播後に再計測で
0件 (一時的な伝播・コールドスタート起因と判断)。

### 重要な知見: レート制限は isolate 単位

300並列リクエストで 429 が1件も発生しなかった。Worker のメモリ内レート制限は
isolate ごとに独立したウィンドウのため、**エッジ全体でのグローバル制限には
ならない**。厳密なグローバル制限が必要な場合は次を検討する:

1. Cloudflare Rate Limiting ルール (エッジ、推奨)
2. KV ベースのカウンター (KV バインディング追加)
3. Durable Objects ベースの集中カウンター (有料プラン要件あり)

現状の実装は「単一 isolate への集中アクセスを緩和する defense in depth」として
位置付け、文書 (docs/セキュリティ.md) に明記する。
