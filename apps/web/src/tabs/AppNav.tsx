import type { ReactElement } from "react";
import type { TabDef, TabId } from "./tabs";

export interface AppNavProps {
  readonly tabs: readonly TabDef[];
  readonly activeTab: TabId;
  readonly onSelect: (id: TabId) => void;
}

/**
 * サイドバーの機能メニュー。各タブは <button> で、現在タブに aria-current を
 * 与える。全タブ実装済み想定のため「準備中」チップは持たない (未実装内容は
 * 本文側で「準備中」を明示する)。
 */
export function AppNav({ tabs, activeTab, onSelect }: AppNavProps): ReactElement {
  return (
    <nav className="app-nav" aria-label="機能メニュー">
      <span className="section-label">メニュー</span>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            className={`nav-item${isActive ? " nav-item--active" : ""}`}
            aria-current={isActive ? "page" : undefined}
            onClick={() => onSelect(tab.id)}
          >
            <span className="nav-item-icon" aria-hidden="true">
              {tab.icon}
            </span>
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
