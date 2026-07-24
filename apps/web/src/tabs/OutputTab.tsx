import { useEffect, useState } from "react";
import type { ReactElement } from "react";

export interface OutputTabProps {
  /** 現在の表示状態を表す共有URL (実URL。ハッシュは map-state 由来)。 */
  readonly shareUrl: string;
}

/**
 * 出力・共有タブ。デザインどおり、レポート出力 (Markdown/CSV/JSON) は
 * disabled の「準備中」ボタンとして提示し、共有URLのみ実機能を持つ。
 *
 * 共有URLは表示状態 (視点・レイヤー選択) だけを含み、住所・履歴・自由記述の
 * ような機密になり得る情報は含まない — デザインの注記をそのまま保証する。
 */
type CopyState = "idle" | "copied" | "failed";

const COPY_LABELS: Record<CopyState, string> = {
  idle: "コピー",
  copied: "コピー済み",
  failed: "コピー失敗",
};

export function OutputTab({ shareUrl }: OutputTabProps): ReactElement {
  const [copyState, setCopyState] = useState<CopyState>("idle");

  useEffect(() => {
    if (copyState === "idle") {
      return;
    }
    const timer = setTimeout(() => setCopyState("idle"), 2000);
    return () => clearTimeout(timer);
  }, [copyState]);

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

  return (
    <section className="output-tab" aria-label="出力・共有">
      <div className="output-card">
        <h3>出力・共有</h3>
        <p className="output-card-sub">根拠付きレポート出力(準備中)</p>
        <div className="output-actions">
          <button type="button" className="btn btn--primary" disabled>
            レポート出力 (Markdown)
          </button>
          <button type="button" className="btn" disabled>
            CSV
          </button>
          <button type="button" className="btn" disabled>
            JSON
          </button>
        </div>
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
