import { useMemo, useState } from "react";
import type { ReactElement } from "react";
import { formatCoordinate, formatDeg, formatPercent } from "../analysis/format";
import { compareAnalyses } from "../history/analysis-history";
import type { AnalysisSnapshot, SavedAnalysis } from "../history/analysis-history";

export interface HistoryTabProps {
  readonly items: readonly SavedAnalysis[];
  readonly demoItems?: readonly SavedAnalysis[];
  /** 現在の解析状態。null なら「保存」ボタンを無効化する。 */
  readonly current: AnalysisSnapshot | null;
  readonly saveStatus: "idle" | "saved" | "error";
  readonly onSaveCurrent: () => void;
  readonly onLoad: (id: string) => void;
  readonly onDelete: (id: string) => void;
  readonly onClear: () => void;
  readonly onGoToMap: () => void;
}

function formatSavedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function terrainSummary(item: SavedAnalysis): string {
  if (item.terrain?.kind !== "ok") {
    return "地形分析なし";
  }
  const stats = item.terrain.stats;
  return `平均 ${formatDeg(stats?.meanDeg ?? null)} / 最大 ${formatDeg(
    stats?.maxDeg ?? null,
  )} / 急傾斜 ${formatPercent(stats?.steepRatio ?? null)}`;
}

function qualityGrade(item: SavedAnalysis): string {
  return item.terrain?.kind === "ok" ? item.terrain.quality.grade : "—";
}

function itemTitle(item: SavedAnalysis): string {
  return item.label ?? formatCoordinate(item.coordinate);
}

const SAVE_LABELS: Record<HistoryTabProps["saveStatus"], string> = {
  idle: "地形分析を実行すると保存できます。",
  saved: "現在の分析を保存しました。",
  error: "保存に失敗しました (ストレージ容量・ブラウザ設定を確認してください)。",
};

/**
 * 分析履歴タブ。ブラウザ内 localStorage の一覧・削除と、2地点の項目別比較を提供する。
 *
 * - 履歴は端末ブラウザ内にのみ保存され、サーバー・共有URL・レポートへ送らない。
 * - 比較は「値の大小で優劣を付ける」のではなく項目別の差を示すだけに留める
 *   (総合危険度の合算をしない設計方針と整合)。
 */
export function HistoryTab({
  items,
  demoItems = [],
  current,
  saveStatus,
  onSaveCurrent,
  onLoad,
  onDelete,
  onClear,
  onGoToMap,
}: HistoryTabProps): ReactElement {
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [confirmClear, setConfirmClear] = useState(false);
  const [compareRejected, setCompareRejected] = useState(false);

  const comparison = useMemo(() => {
    const allItems = [...items, ...demoItems];
    if (selectedIds.length !== 2) {
      return null;
    }
    const [leftId, rightId] = selectedIds;
    const left = allItems.find((item) => item.id === leftId);
    const right = allItems.find((item) => item.id === rightId);
    if (left === undefined || right === undefined) {
      return null;
    }
    return { left, right, rows: compareAnalyses(left, right) };
  }, [items, demoItems, selectedIds]);

  const toggleSelection = (id: string): void => {
    setCompareRejected(false);
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((selected) => selected !== id));
      return;
    }
    if (selectedIds.length >= 2) {
      setCompareRejected(true);
      return;
    }
    setSelectedIds([...selectedIds, id]);
  };

  const handleClear = (): void => {
    setConfirmClear(false);
    setSelectedIds([]);
    onClear();
  };

  const compareStatus = compareRejected
    ? "比較できるのは2件までです。一度チェックを外してから選び直してください。"
    : comparison !== null
      ? "2件を選択中です。下の表で比較できます。"
      : "2件チェックすると、下に比較表が表示されます。";

  return (
    <section className="analysis-tab history-tab" aria-label="分析履歴">
      <div className="analysis-card">
        <div className="analysis-card-header history-header">
          <div>
            <h4>現在の分析を保存</h4>
            <p>ブラウザ内 (localStorage) に保存し、後で開く・2地点で比較できます。</p>
          </div>
          <button
            type="button"
            className="btn btn--primary"
            disabled={current === null}
            onClick={onSaveCurrent}
          >
            現在の分析を保存
          </button>
        </div>
        <p className="history-save-status" role="status" aria-live="polite">
          {SAVE_LABELS[saveStatus]}
        </p>
      </div>

      <div className="analysis-card">
        <div className="analysis-card-header">
          <h4>保存済みの分析 ({items.length}件)</h4>
          <p>保存日時・地点・主なメトリクス。比較には2件までチェックできます。</p>
        </div>

        {items.length === 0 ? (
          <div className="history-empty">
            <p>保存された分析はまだありません。</p>
            <button type="button" className="btn" onClick={onGoToMap}>
              地図で地点を選ぶ
            </button>
          </div>
        ) : (
          <>
            <ul className="history-list">
              {items.map((item) => (
                <li key={item.id} className="history-row">
                  <label className="history-row-select">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(item.id)}
                      onChange={() => toggleSelection(item.id)}
                      aria-label={`比較対象に選択: ${itemTitle(item)}`}
                    />
                    <span className="visually-hidden">比較対象に選択</span>
                  </label>
                  <div className="history-row-body">
                    <p className="history-row-title">{itemTitle(item)}</p>
                    <p className="history-row-meta">
                      {item.label === undefined ? "" : `${formatCoordinate(item.coordinate)} ・ `}
                      保存: {formatSavedAt(item.savedAt)} ・ {terrainSummary(item)} ・ DEM{" "}
                      {qualityGrade(item)}
                    </p>
                  </div>
                  <div className="history-row-actions">
                    <button
                      type="button"
                      className="btn btn--small"
                      onClick={() => onLoad(item.id)}
                    >
                      開く
                    </button>
                    <button
                      type="button"
                      className="btn btn--small"
                      onClick={() => onDelete(item.id)}
                    >
                      削除
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="history-clear">
              {confirmClear ? (
                <div className="history-clear-confirm" role="alert">
                  <span>保存済みの分析をすべて削除しますか？ この操作は元に戻せません。</span>
                  <button type="button" className="btn btn--small" onClick={handleClear}>
                    実行
                  </button>
                  <button
                    type="button"
                    className="btn btn--small"
                    onClick={() => setConfirmClear(false)}
                  >
                    キャンセル
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn btn--small"
                  onClick={() => setConfirmClear(true)}
                >
                  すべて削除
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {demoItems.length > 0 ? (
        <div className="analysis-card">
          <div className="analysis-card-header">
            <h4>デモサンプル ({demoItems.length}件)</h4>
            <p>架空ダミーデータです。開く・比較・レポート出力の確認に使えます。</p>
          </div>
          <ul className="history-list">
            {demoItems.map((item) => (
              <li key={item.id} className="history-row history-row--demo">
                <label className="history-row-select">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(item.id)}
                    onChange={() => toggleSelection(item.id)}
                    aria-label={`比較対象に選択: ${itemTitle(item)}`}
                  />
                  <span className="visually-hidden">比較対象に選択</span>
                </label>
                <div className="history-row-body">
                  <p className="history-row-title">
                    {itemTitle(item)}
                    <span className="history-demo-badge">デモ</span>
                  </p>
                  <p className="history-row-meta">
                    {formatCoordinate(item.coordinate)} ・ {terrainSummary(item)} ・ DEM{" "}
                    {qualityGrade(item)}
                  </p>
                  {item.scenario === undefined ? null : (
                    <p className="history-row-scenario">{item.scenario}</p>
                  )}
                </div>
                <div className="history-row-actions">
                  <button type="button" className="btn btn--small" onClick={() => onLoad(item.id)}>
                    開く
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="history-compare-note" role="status" aria-live="polite">
        {compareStatus}
      </p>
      {comparison !== null ? (
        <div className="history-compare" role="region" aria-label="2地点の比較">
          <div className="history-compare-head">
            <h5>2地点の比較</h5>
            <button
              type="button"
              className="btn btn--small"
              onClick={() => {
                setSelectedIds([]);
                setCompareRejected(false);
              }}
            >
              比較をやめる
            </button>
          </div>
          <table className="comparison-table">
            <caption className="visually-hidden">
              保存済み2地点の分析項目の比較 (左: {itemTitle(comparison.left)}、右:{" "}
              {itemTitle(comparison.right)})
            </caption>
            <thead>
              <tr>
                <th scope="col">項目</th>
                <th scope="col">{itemTitle(comparison.left)}</th>
                <th scope="col">{itemTitle(comparison.right)}</th>
              </tr>
            </thead>
            <tbody>
              {comparison.rows.map((row) => (
                <tr key={row.key} className={row.differs ? "comparison-row--diff" : undefined}>
                  <th scope="row">{row.label}</th>
                  <td>{row.left}</td>
                  <td>{row.right}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="analysis-card-footnote">
            差がある行を強調表示していますが、数値の大小だけで安全・危険を判定しません。
            現地調査・専門家確認の要否は別途検討してください。
          </p>
        </div>
      ) : null}

      <p className="analysis-note analysis-note--unknown" role="note">
        履歴はこのブラウザ内にのみ保存されます。別端末・別ブラウザには引き継がれず、
        共有URLやレポート・サーバーには送信されません。
        <strong>「データなし」「判定不能」は安全を意味しません。</strong>
      </p>
    </section>
  );
}
