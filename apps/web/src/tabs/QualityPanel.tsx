import type { ReactElement } from "react";
import type { DemSource, Provenance, QualitySummary } from "@civil-terrain/domain";
import { formatPercent } from "../analysis/format";

export interface QualityPanelProps {
  readonly quality: QualitySummary;
  readonly provenance: readonly Provenance[];
}

/**
 * 解析結果の品質と出典 (Evidence First)。欠損率・ソース内訳・警告を隠さず提示し、
 * 出典は provenance のリンクをそのまま示す。
 */
export function QualityPanel({ quality, provenance }: QualityPanelProps): ReactElement {
  const usedSources = (Object.keys(quality.sourceMix) as DemSource[]).filter(
    (source) => quality.sourceMix[source] > 0,
  );

  return (
    <section className="quality-panel" aria-label="品質と出典">
      <h4>品質と出典</h4>
      <dl className="quality-panel-facts">
        <div>
          <dt>品質グレード</dt>
          <dd className="dem-meta-value--mono">{quality.grade}</dd>
        </div>
        <div>
          <dt>欠損率</dt>
          <dd className="dem-meta-value--mono">{formatPercent(quality.missingRatio)}</dd>
        </div>
        <div>
          <dt>使用ソース</dt>
          <dd>
            {usedSources.length > 0
              ? usedSources
                  .map((source) => `${source} (${quality.sourceMix[source]}点)`)
                  .join(" / ")
              : "—"}
          </dd>
        </div>
      </dl>
      {quality.warnings.length > 0 ? (
        <ul className="quality-panel-warnings">
          {quality.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
      {provenance.length > 0 ? (
        <p className="quality-panel-provenance">
          出典:{" "}
          {provenance.map((entry, index) => (
            <span key={entry.sourceId}>
              {index > 0 ? " / " : ""}
              <a href={entry.termsUrl} target="_blank" rel="noreferrer">
                {entry.sourceName}
              </a>
            </span>
          ))}
        </p>
      ) : null}
    </section>
  );
}
