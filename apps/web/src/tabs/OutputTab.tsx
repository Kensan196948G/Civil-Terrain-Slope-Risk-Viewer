import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import type { CheckCard } from "@civil-terrain/domain";
import type { ElevationResult } from "../elevation/elevation-client";
import type { TerrainAnalysisResult } from "../analysis/terrain-service";
import type { SectionAnalysisResult } from "../analysis/section-service";
import {
  buildCsvReport,
  buildJsonReport,
  buildMarkdownReport,
  createReportInput,
} from "../output/report-generators";
import { dateStamp, downloadTextFile } from "../output/download";

export interface OutputTabProps {
  /** 現在の表示状態を表す共有URL (実URL。ハッシュは map-state 由来)。 */
  readonly shareUrl: string;
  /** レポートに含める解析結果。地点未選択時は null (出力ボタンを無効化)。 */
  readonly report: OutputReportData | null;
}

export interface OutputReportData {
  readonly coordinate: { readonly lat: number; readonly lon: number } | null;
  readonly elevation: ElevationResult | null;
  readonly terrain: TerrainAnalysisResult | null;
  readonly section: SectionAnalysisResult | null;
  readonly confirmCards: readonly CheckCard[];
}

/**
 * 出力・共有タブ。レポート出力 (Markdown/CSV/JSON) はクライアントサイドで
 * 生成・保存し、共有URLは表示状態 (視点・レイヤー選択) だけを含む。
 *
 * 共有URLは表示状態 (視点・レイヤー選択) だけを含み、住所・履歴・自由記述の
 * ような機密になり得る情報は含まない — デザインの注記をそのまま保証する。
 */
type CopyState = "idle" | "copied" | "failed";
type DownloadState = "idle" | "done";

const COPY_LABELS: Record<CopyState, string> = {
  idle: "コピー",
  copied: "コピー済み",
  failed: "コピー失敗",
};

export function OutputTab({ shareUrl, report }: OutputTabProps): ReactElement {
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [downloadState, setDownloadState] = useState<DownloadState>("idle");

  useEffect(() => {
    if (copyState === "idle" && downloadState === "idle") {
      return;
    }
    const timer = setTimeout(() => {
      setCopyState("idle");
      setDownloadState("idle");
    }, 2000);
    return () => clearTimeout(timer);
  }, [copyState, downloadState]);

  const handleCopy = (): void => {
    // clipboard API が無い環境 (非セキュアコンテキスト等) や権限拒否では
    // 「コピー失敗」を明示する — 成功の誤表示も unhandled rejection もさせない。
    const clipboard = navigator.clipboard;
    if (clipboard === undefined) {
      setCopyState("failed");
      return;
    }
    void clipboard.writeText(shareUrl).then(
      () => setCopyState("copied"),
      () => setCopyState("failed"),
    );
  };

  const handleDownload = (kind: "markdown" | "csv" | "json"): void => {
    if (report === null) {
      return;
    }
    const stamp = dateStamp(new Date());
    const input = createReportInput({
      generatedAt: new Date().toISOString(),
      coordinate: report.coordinate,
      elevation: report.elevation,
      terrain: report.terrain,
      section: report.section,
      confirmCards: report.confirmCards,
      shareUrl,
    });
    if (kind === "markdown") {
      downloadTextFile(
        `terrain-report-${stamp}.md`,
        buildMarkdownReport(input),
        "text/markdown; charset=utf-8",
      );
    } else if (kind === "csv") {
      downloadTextFile(
        `terrain-report-${stamp}.csv`,
        buildCsvReport(input),
        "text/csv; charset=utf-8",
      );
    } else {
      downloadTextFile(
        `terrain-report-${stamp}.json`,
        JSON.stringify(buildJsonReport(input), null, 2),
        "application/json; charset=utf-8",
      );
    }
    setDownloadState("done");
  };

  return (
    <section className="output-tab" aria-label="出力・共有">
      <div className="output-card">
        <h3>出力・共有</h3>
        <p className="output-card-sub">根拠付きレポート出力 (Markdown / CSV / JSON)</p>
        <div className="output-actions">
          <button
            type="button"
            className="btn btn--primary"
            disabled={report === null}
            onClick={() => handleDownload("markdown")}
            aria-describedby="output-report-note"
          >
            レポート出力 (Markdown)
          </button>
          <button
            type="button"
            className="btn"
            disabled={report === null}
            onClick={() => handleDownload("csv")}
            aria-describedby="output-report-note"
          >
            CSV
          </button>
          <button
            type="button"
            className="btn"
            disabled={report === null}
            onClick={() => handleDownload("json")}
            aria-describedby="output-report-note"
          >
            JSON
          </button>
        </div>
        <p id="output-report-note" className="output-note" role="status" aria-live="polite">
          {report === null
            ? "地点を選択すると、地形・断面・確認支援の結果をレポートとして保存できます。"
            : downloadState === "done"
              ? "ダウンロードしました。"
              : "出典・品質・判定不能の扱いを含むレポートをブラウザに保存します。"}
        </p>
      </div>
      <div className="output-card">
        <h3>共有URL</h3>
        <div className="share-url-row">
          <input
            type="text"
            className="share-url-input"
            readOnly
            value={shareUrl}
            aria-label="共有URL"
            onFocus={(event) => event.currentTarget.select()}
          />
          <button type="button" className="btn" onClick={handleCopy}>
            {COPY_LABELS[copyState]}
          </button>
        </div>
        <p className="output-note">住所・現在地履歴・自由記述は含まれません。</p>
      </div>
      <div className="output-card output-card--empty">まだ出力履歴はありません。</div>
    </section>
  );
}
