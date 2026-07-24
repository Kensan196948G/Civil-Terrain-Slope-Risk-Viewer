import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * 地図クリック→標高取得→パネル表示の smoke (FR-001 地点指定 / Issue #17)。
 *
 * Worker (GET /elevation) は E2E では起動しないため、フロントの
 * `fetchElevation` が叩く `/api/v1/elevation` を fixture 応答へ差し替える。
 * これにより 3 つの利用者可視な結末を決定的に検証する:
 *   - ok         … 標高値・ソース・出典が表示される
 *   - no-coverage… 「データが無いことは安全を意味しません」(要件 2.1)
 * どちらも外部ネットワークに依存せず、コンソールエラー 0 件を保証する。
 */

const FIXTURE_TILE = readFileSync(new URL("../fixtures/dem/02-plain.png", import.meta.url));

/** GET /elevation の成功応答 (openapi getElevation の data)。品質・出典を含む。 */
const OK_BODY = {
  data: {
    coordinate: { lat: 35.1, lon: 136.9 },
    elevationM: 123.45,
    source: "gsi-dem10b",
    quality: { grade: "A", coverage: "full" },
    provenance: [
      {
        sourceName: "国土地理院 標高タイル",
        sourceUrl: "https://maps.gsi.go.jp/",
        termsUrl: "https://maps.gsi.go.jp/development/ichiran.html",
        retrievedAt: "2026-07-24T00:00:00Z",
      },
    ],
  },
} as const;

/** ページ全体の JS 例外と console.error を収集する (0 件であることを各テストで検証)。 */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(`pageerror: ${String(error)}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(`console.error: ${message.text()}`);
    }
  });
  return errors;
}

test.beforeEach(async ({ page }) => {
  // GSI タイルは合成 PNG へ差し替え、地図描画をネットワーク非依存にする。
  await page.route("https://cyberjapandata.gsi.go.jp/**", async (route) => {
    await route.fulfill({ contentType: "image/png", body: FIXTURE_TILE });
  });
});

test("クリック→標高表示: 標高・ソース・出典がパネルに表示される", async ({ page }) => {
  const errors = collectErrors(page);

  // 座標に依らず ok 応答を返す (クリック位置は headless では非決定的なため)。
  await page.route("**/api/v1/elevation**", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(OK_BODY) });
  });

  await page.goto("/");

  const panel = page.getByRole("region", { name: "地点標高" });
  await expect(panel.getByText("地図をクリックすると", { exact: false })).toBeVisible();

  // MapLibre canvas の DOM クリックが map.on("click") を発火し、標高取得が走る。
  const canvas = page.locator(".maplibregl-canvas");
  await expect(canvas).toBeVisible();
  await canvas.click();

  // done(ok) 分岐: 標高値・ソース/品質・出典リンクが揃う。
  await expect(panel.getByText("123.45 m")).toBeVisible();
  await expect(panel.getByText("gsi-dem10b (グレード A)")).toBeVisible();
  await expect(panel.getByRole("link", { name: "国土地理院 標高タイル" })).toBeVisible();

  expect(errors).toEqual([]);
});

test("クリック→データなし: 欠損は安全を意味しない旨を表示する", async ({ page }) => {
  const errors = collectErrors(page);

  // 404 は fetchElevation で no-coverage へマップされる (通信エラーではない)。
  await page.route("**/api/v1/elevation**", async (route) => {
    await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
  });

  await page.goto("/");

  const canvas = page.locator(".maplibregl-canvas");
  await expect(canvas).toBeVisible();
  await canvas.click();

  const panel = page.getByRole("region", { name: "地点標高" });
  // 要件 2.1: 欠損をリスクなしと誤認させない。文言を画面レベルで固定する。
  await expect(panel.getByText("この地点の標高データはありません", { exact: false })).toBeVisible();
  await expect(
    panel.getByText("データが無いことは安全を意味しません", { exact: false }),
  ).toBeVisible();

  expect(errors).toEqual([]);
});
