// Module import instead of the global: the repo intentionally ships no
// @types/node globals (see state.json TSCONFIG-LIB-OVERRIDE), and node:*
// module types resolve on their own here just like node:fs in tests/fixtures.
import { env } from "node:process";
import { defineConfig, devices } from "@playwright/test";

/**
 * E2E smoke (詳細設計 14章 / Issue #10)。
 *
 * 実行は GitHub Actions ランナーを一次環境とする (ローカルの Claude Code 実行
 * 環境では headless Chrome が起動できないため。Issue #10 参照)。開発者のローカル
 * マシンでは `pnpm test:e2e` がそのまま動く。
 *
 * GSI タイルへの実リクエストはテスト側で fixture PNG に差し替え、ネットワーク
 * 非依存で安定実行する (テスト品質戦略: fixture だけで成功すること)。
 */
export default defineConfig({
  testDir: ".",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: env["CI"] !== undefined ? 1 : 0,
  // The html reporter feeds the CI failure artifact (upload path: repo-root
  // playwright-report/, so outputFolder points there relative to this file).
  reporter:
    env["CI"] !== undefined
      ? [["list"], ["github"], ["html", { outputFolder: "../../playwright-report", open: "never" }]]
      : [["list"]],
  use: {
    baseURL: "http://localhost:5178",
    // CI の headless Chromium は SwiftShader で WebGL を提供する (MapLibre が必要とする)。
    launchOptions: { args: ["--enable-unsafe-swiftshader"] },
    // Failure diagnostics for the uploaded report (M1 in the PR #11 review).
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "pnpm --filter @civil-terrain/web exec vite --port 5178 --strictPort",
    url: "http://localhost:5178",
    reuseExistingServer: env["CI"] === undefined,
    timeout: 60_000,
  },
});
