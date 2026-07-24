/**
 * 画面タブの単一定義。ナビ表示・トップバー副題・本文見出しはすべてここから
 * 派生させ、ラベルの二重管理を避ける。
 *
 * 実装済みは地図 (SCR-01) と出力・共有 (honest by design: 全操作は準備中表示)。
 * 地形分析・断面分析・確認支援は後続Sprintのため、地点選択時も数値は出さず
 * 「準備中」を示す — 架空の分析値は「データなし ≠ 安全」の原則に反するため。
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
  /** 分析タブの本文見出しと準備中の説明 (地図・出力タブは持たない)。 */
  readonly pending?: { readonly title: string; readonly description: string };
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
    context: "検出された地形分類と傾斜統計のサマリーです。",
    pending: {
      title: "地形分析",
      description: "選択地点周辺の地形分類と傾斜統計を表示します。",
    },
  },
  {
    id: "cross-section",
    icon: "📈",
    label: "断面分析",
    topbarSub: "任意線の標高断面",
    context: "任意線に沿った標高断面を表示します。",
    pending: {
      title: "断面分析",
      description: "地図上の任意線に沿った標高断面と距離・勾配の統計を表示します。",
    },
  },
  {
    id: "confirm",
    icon: "⚠️",
    label: "確認支援",
    topbarSub: "要確認・参考情報・判定不能",
    context: "地点周辺で確認が必要な項目をまとめます。",
    pending: {
      title: "確認支援",
      description: "地点周辺で現地確認が必要な項目を、根拠付きで一覧表示します。",
    },
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
