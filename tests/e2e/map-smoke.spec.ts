import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * 地図レイヤー基本経路の smoke (詳細設計 Phase 1 終了条件 / Issue #10)。
 *
 * GSI タイルは fixture の合成 PNG へ差し替える。外部ネットワークに依存せず、
 * タイル取得失敗によるコンソールエラーも発生しない。
 */

const FIXTURE_TILE = readFileSync(new URL("../fixtures/dem/02-plain.png", import.meta.url));

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
  await page.route("https://cyberjapandata.gsi.go.jp/**", async (route) => {
    await route.fulfill({ contentType: "image/png", body: FIXTURE_TILE });
  });
});

test("初期表示: 地図・レイヤーUI・帰属が表示され、コンソールエラーが出ない", async ({ page }) => {
  const errors = collectErrors(page);

  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: /Civil Terrain & Slope Risk Viewer/ }),
  ).toBeVisible();
  await expect(page.getByRole("radio", { name: "標準地図" })).toBeChecked();

  // MapLibre が WebGL 初期化に成功すると canvas が生成される。
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();

  // 帰属表示の常設 (要件 KPI: 出典表示率 100%)。
  await expect(page.getByRole("link", { name: "国土地理院" })).toBeVisible();

  // "Style is not done loading." (PR #9 H1) を含むあらゆるエラーを検出する。
  expect(errors).toEqual([]);
});

test("レイヤー切替: 傾斜量図を重ねると共有URLハッシュへ反映される", async ({ page }) => {
  const errors = collectErrors(page);

  await page.goto("/");
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();

  await page.getByRole("checkbox", { name: "傾斜量図" }).check();
  await expect(page).toHaveURL(/ov=slope/);

  await page.getByRole("radio", { name: "淡色地図" }).check();
  await expect(page).toHaveURL(/base=pale/);

  expect(errors).toEqual([]);
});

test("共有URL復元: ハッシュからレイヤー選択が復元される", async ({ page }) => {
  const errors = collectErrors(page);

  await page.goto("/#view=8/35.1/136.9&base=photo&ov=hillshade");

  await expect(page.getByRole("radio", { name: "写真" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "陰影起伏図" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "傾斜量図" })).not.toBeChecked();
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();

  expect(errors).toEqual([]);
});
