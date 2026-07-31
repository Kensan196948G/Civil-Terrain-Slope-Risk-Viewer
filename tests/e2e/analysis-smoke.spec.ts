import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * 分析3タブ (地形分析・断面分析・確認支援) の smoke (Issue #33)。
 *
 * DEM タイルは 02-plain fixture (完全平坦 12.50 m・傾斜 0°) へ差し替えるため、
 * 各タブの結果は決定的になる: 傾斜統計 0°・地形分類 平坦・確認カード 0 件。
 * 単点標高 API (/api/v1/elevation) は地点パネル用で、分析はクライアント側の
 * タイル直取得のみに依存する (elevation-smoke.spec.ts と同じモック方針)。
 *
 * 視点は共有URLハッシュ (#view=<zoom>/<lat>/<lon>) で固定する。flyTo を経ずに
 * 初期カメラが決まるため、断面線のクリック間隔から実距離が安定して求まる
 * (zoom 15・lat 35.36 で約 3.9 m/px → 150 px ≈ 585 m、有効範囲 30 m〜20 km 内)。
 */

const FIXTURE_TILE = readFileSync(new URL("../fixtures/dem/02-plain.png", import.meta.url));

/** 視点固定ハッシュ。分析タブは表示中心付近の地点選択を前提とする。 */
const VIEW_HASH = "#view=15/35.36/138.72";

/** GET /elevation の成功応答 (地点パネル表示用。分析結果には影響しない)。 */
const OK_BODY = {
  data: {
    coordinate: { lat: 35.36, lon: 138.72 },
    elevationM: 12.5,
    source: "gsi-dem5a",
    quality: { grade: "A", coverage: "full" },
    provenance: [
      {
        sourceName: "国土地理院 標高タイル",
        sourceUrl: "https://maps.gsi.go.jp/",
        termsUrl: "https://maps.gsi.go.jp/development/ichiran.html",
        retrievedAt: "2026-07-31T00:00:00Z",
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
  // [debug] CI での DEM 取得失敗を特定するための一時ロギング (原因判明後に削除)。
  page.on("request", (request) => {
    if (request.url().includes("gsi.go.jp")) {
      console.log(`[dbg req] ${request.url()}`);
    }
  });
  page.on("requestfailed", (request) => {
    if (request.url().includes("gsi.go.jp")) {
      console.log(`[dbg reqfail] ${request.url()} :: ${request.failure()?.errorText}`);
    }
  });
  // GSI タイル (地図・DEM とも) は合成 PNG へ差し替え、ネットワーク非依存にする。
  await page.route("https://cyberjapandata.gsi.go.jp/**", async (route) => {
    await route.fulfill({ contentType: "image/png", body: FIXTURE_TILE });
  });
  await page.route("**/api/v1/elevation**", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(OK_BODY) });
  });
});

/** 地図クリックで地点を選択する (elevation パネルの応答表示で完了を待つ)。 */
async function selectPoint(page: Page): Promise<void> {
  const canvas = page.locator(".maplibregl-canvas");
  await expect(canvas).toBeVisible();
  await canvas.click();
  await expect(page.getByRole("region", { name: "地点標高" }).getByText("12.50 m")).toBeVisible();
}

test("地形分析: 地点選択→タブ切替で傾斜統計と地形分類が実計算される", async ({ page }) => {
  const errors = collectErrors(page);

  await page.goto(`/${VIEW_HASH}`);
  await selectPoint(page);

  await page.getByRole("button", { name: "地形分析" }).click();
  const tab = page.getByRole("region", { name: "地形分析" });
  await expect(tab.getByText("対象地点:")).toBeVisible();

  // [debug] ページ内から sampler と同条件で DEM タイルを直接 fetch し、
  // route 差し替えの成否と失敗理由を CI ログへ出す (原因判明後に削除)。
  const probe = await page.evaluate(async () => {
    const url = "https://cyberjapandata.gsi.go.jp/xyz/dem5a_png/15/29012/12939.png";
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      const buf = await res.arrayBuffer();
      return `status=${res.status} bytes=${buf.byteLength}`;
    } catch (error) {
      return `ERR ${String(error)}`;
    }
  });
  console.log(`[dbg probe] ${probe}`);
  const tabText = await tab.innerText().catch(() => "(unavailable)");
  console.log(`[dbg tab-初期] ${tabText.replaceAll("\n", " | ").slice(0, 300)}`);

  // done(ok) 分岐: 統計グリッドが出れば「判定不能」ノートには入っていない。
  // [debug] 20s 待ち (タイル取得タイムアウト 15s 後の最終状態も観測するため)。
  await expect(tab.getByText("平均傾斜"))
    .toBeVisible({ timeout: 20000 })
    .catch(async (error) => {
      const finalText = await tab.innerText().catch(() => "(unavailable)");
      console.log(`[dbg tab-最終] ${finalText.replaceAll("\n", " | ").slice(0, 400)}`);
      throw error;
    });
  await expect(tab.getByText("最大傾斜")).toBeVisible();
  await expect(tab.getByRole("heading", { name: "地形分類 内訳" })).toBeVisible();
  // 完全平坦 fixture なので分類は「平坦」が現れる (凡例行)。
  await expect(tab.getByText("平坦").first()).toBeVisible();

  expect(errors).toEqual([]);
});

test("断面分析: 始点・終点のクリック指定で縦断プロファイルが表示される", async ({ page }) => {
  const errors = collectErrors(page);

  await page.goto(`/${VIEW_HASH}`);
  const canvas = page.locator(".maplibregl-canvas");
  await expect(canvas).toBeVisible();

  // 未指定状態 → 地図での断面線指定フローへ。
  await page.getByRole("button", { name: "断面分析" }).click();
  const tab = page.getByRole("region", { name: "断面分析" });
  await expect(tab.getByRole("heading", { name: "断面線が未指定です" })).toBeVisible();
  await page.getByRole("button", { name: "地図で断面線を指定" }).click();

  // 地図タブへ戻り、始点→終点の順にクリック指定する。
  await expect(page.getByRole("status")).toContainText("断面の始点をクリックしてください");
  await canvas.click({ position: { x: 400, y: 250 } });
  await expect(page.getByRole("status")).toContainText("断面の終点をクリックしてください");
  await canvas.click({ position: { x: 550, y: 250 } });

  // 終点指定後は断面分析タブへ自動遷移し、統計とプロファイルが揃う。
  await expect(tab.getByRole("heading", { name: "縦断プロファイル" })).toBeVisible();
  await expect(tab.getByText("総延長")).toBeVisible();
  await expect(tab.getByText("最大勾配")).toBeVisible();

  expect(errors).toEqual([]);
});

test("確認支援: 平坦地形ではカード0件と『安全の保証ではない』注記が出る", async ({ page }) => {
  const errors = collectErrors(page);

  await page.goto(`/${VIEW_HASH}`);
  await selectPoint(page);

  await page.getByRole("button", { name: "確認支援" }).click();
  const tab = page.getByRole("region", { name: "確認支援" });
  await expect(tab.getByRole("heading", { name: "確認支援カード" })).toBeVisible();

  // 完全平坦 + 欠損 0 のため発火カードは無い。ただし「安全」とは断定しない文面。
  await expect(tab.getByText("しきい値を超過した項目はありません")).toBeVisible();
  await expect(tab.getByText("これは安全の保証ではありません")).toBeVisible();
  await expect(tab.getByText("総合危険度の合算は行いません")).toBeVisible();

  expect(errors).toEqual([]);
});
