import type { ReactElement } from "react";
import type { RiskStatus } from "@civil-terrain/domain";

/**
 * Domain risk statuses plus a UI-only PENDING state shown while analysis runs.
 * PENDING has no domain meaning, so it is added here rather than in the domain layer.
 */
export type DisplayStatus = RiskStatus | "PENDING";

type BadgeShape = "circle" | "triangle" | "hatched" | "spinner";

interface StatusPresentation {
  readonly icon: string;
  readonly label: string;
  readonly shape: BadgeShape;
}

const PRESENTATION: Record<DisplayStatus, StatusPresentation> = {
  REFERENCE: { icon: "ℹ️", label: "参考情報", shape: "circle" },
  CHECK_REQUIRED: { icon: "⚠️", label: "追加確認が必要", shape: "triangle" },
  UNKNOWN: { icon: "❔", label: "データ不足/取得失敗", shape: "hatched" },
  PENDING: { icon: "⏳", label: "分析中", shape: "spinner" },
};

export interface StatusBadgeProps {
  readonly status: DisplayStatus;
}

/**
 * Renders a risk status without relying on color alone: an emoji icon and a text
 * label always accompany the badge, and `data-shape` exposes a non-color shape hook
 * for Sprint 1+ styling.
 */
export function StatusBadge({ status }: StatusBadgeProps): ReactElement {
  const { icon, label, shape } = PRESENTATION[status];
  const isPending = status === "PENDING";

  return (
    <span
      className={`status-badge status-badge--${status.toLowerCase()}`}
      data-status={status}
      data-shape={shape}
      role={isPending ? "progressbar" : "status"}
      aria-label={isPending ? label : undefined}
    >
      <span className="status-badge__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="status-badge__label">{label}</span>
    </span>
  );
}
