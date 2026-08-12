/**
 * 負荷計測の簡易スクリプト (外部依存なし)。
 * 使い方: node tests/load/measure.mjs <url> [total] [concurrency]
 * 出力: ステータス分布 / 完了数 / エラー数 / p50・p95・p99 レイテンシ
 */
/* eslint-disable no-console -- CLI スクリプトの標準出力 */
/* global console, fetch, performance, process */
const url = process.argv[2];
const total = Number(process.argv[3] ?? 100);
const concurrency = Number(process.argv[4] ?? 10);

if (url === undefined) {
  console.error("usage: node tests/load/measure.mjs <url> [total] [concurrency]");
  process.exit(1);
}

const statusCounts = new Map();
const latencies = [];
let errors = 0;
let next = 0;

async function worker() {
  while (true) {
    const index = next++;
    if (index >= total) break;
    const started = performance.now();
    try {
      const response = await fetch(url);
      statusCounts.set(response.status, (statusCounts.get(response.status) ?? 0) + 1);
      latencies.push(performance.now() - started);
    } catch {
      errors++;
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));

latencies.sort((a, b) => a - b);
const percentile = (p) =>
  latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))];

console.log(`url: ${url}`);
console.log(`total: ${total} / concurrency: ${concurrency}`);
console.log(
  "status:",
  [...statusCounts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([s, n]) => `${s}:${n}`)
    .join(" "),
);
console.log(`errors: ${errors}`);
if (latencies.length > 0) {
  console.log(
    `latency ms: p50=${percentile(0.5).toFixed(1)} p95=${percentile(0.95).toFixed(1)} p99=${percentile(0.99).toFixed(1)}`,
  );
}
