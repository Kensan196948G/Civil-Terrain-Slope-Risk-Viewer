/**
 * 画面タブの単一定義。ナビ表示・トップバー副題・サイドバー説明はすべてここから
 * 派生させ、ラベルの二重管理を避ける。
 *
 * 全タブ実装済み: 地図 (SCR-01)、地形分析・断面分析・確認支援 (DEM 実データ
 * からのクライアントサイド解析)、出力・共有 (共有URL。レポート出力のみ準備中)。
 */

export type TabId = "map" | "terrain" | "cross-section" | "confirm" | "output";

export interface TabDef {
  readonly id: TabId;
  readonly icon: string;
  readonly label: string;
  /** トップバー副題。地図タブは表示中レイヤーで動的に上書きする。 */
  readonly topbarSub: string;
  /** サイドバーに出すタブ説明 (地図タブ以外)。 */
  readonly context: string;
}

export const TABS: readonly TabDef[] = [
  {
    id: "map",
    icon: "🗺️",
    label: "地図",
    topbarSub: "",
    context: "国土地理院タイルの表示とレイヤー切替、地図クリックによる標高取得を行います。",
  },
  {
    id: "terrain",
    icon: "⛰️",
    label: "地形分析",
    topbarSub: "地形分類・傾斜統計",
    context: "選択地点周辺の DEM から傾斜統計と地形分類を実計算します。",
  },
  {
    id: "cross-section",
    icon: "📈",
    label: "断面分析",
    topbarSub: "任意線の標高断面",
    context: "地図上で指定した任意線に沿った標高断面と勾配統計を実計算します。",
  },
  {
    id: "confirm",
    icon: "⚠️",
    label: "確認支援",
    topbarSub: "要確認・参考情報・判定不能",
    context: "実測メトリクスのルール評価により、現地確認が必要な項目を提示します。",
  },
  {
    id: "output",
    icon: "🧾",
    label: "出力・共有",
    topbarSub: "共有URL",
    context: "表示状態の共有URLを取得できます。レポート出力は準備中です。",
  },
];

export function findTab(id: TabId): TabDef {
  const tab = TABS.find((candidate) => candidate.id === id);
  if (tab === undefined) {
    // TabId は TABS の定義から導出されるため、ここには到達しない。
    throw new Error(`unknown tab id: ${id}`);
  }
  return tab;
}
