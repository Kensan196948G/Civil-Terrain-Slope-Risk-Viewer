import type { ReactElement } from "react";

export interface SiteSearchProps {
  readonly query: string;
  /** 直近の検索エラー文言。null なら非表示。 */
  readonly error: string | null;
  readonly onQueryChange: (query: string) => void;
  readonly onSubmit: () => void;
}

/**
 * トップバーの地点検索欄。解決ロジックは search/site-search.ts の純粋関数に
 * 寄せ、このコンポーネントは入力と送信の接続のみを担う。
 *
 * デザインの手動 Enter 処理に代えて <form onSubmit> を用い、Enter 送信と
 * 送信ボタンをネイティブに機能させる。ラベルの無い入力には aria-label を付与。
 */
export function SiteSearch({
  query,
  error,
  onQueryChange,
  onSubmit,
}: SiteSearchProps): ReactElement {
  return (
    <div className="site-search">
      <form
        role="search"
        className="site-search-box"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <button type="submit" className="site-search-submit" aria-label="検索を実行">
          <span aria-hidden="true">🔍</span>
        </button>
        <input
          type="text"
          className="site-search-input"
          value={query}
          onChange={(event) => onQueryChange(event.currentTarget.value)}
          placeholder="住所・地名・緯度,経度で検索(例: 富士山)"
          aria-label="地点検索"
        />
      </form>
      {error !== null ? (
        <p className="site-search-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
