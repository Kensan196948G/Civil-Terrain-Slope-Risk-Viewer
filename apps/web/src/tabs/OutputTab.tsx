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
export function OutputTab({ shareUrl }: OutputTabProps): ReactElement {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const handleCopy = (): void => {
    // clipboard API が無い環境 (非セキュアコンテキスト等) では黙って失敗させず
    // ボタン状態を変えない — 「コピー済み」の誤表示をしない。
    void navigator.clipboard?.writeText(shareUrl).then(() => setCopied(true));
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
            {copied ? "コピー済み" : "コピー"}
          </button>
        </div>
        <p className="output-note">住所・現在地履歴・自由記述は含まれません。</p>
      </div>
      <div className="output-card output-card--empty">まだ出力履歴はありません。</div>
    </section>
  );
}
