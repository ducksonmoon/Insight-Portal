"use client";

import { computeKpiCardValue, formatKpiValue } from "@/lib/reports/kpi-band";
import { cn } from "@/lib/utils";
import type { KpiCardSpec, ReportColumnTone } from "@/types/report";

/**
 * The "10-second glance" layer a report's grid alone can't give — a strip of
 * stat cards computed client-side from rows the report already returned (no
 * extra query, no round trip). Reuses the exact `stat-strip` markup and
 * tone tokens the dashboard home's own KpiStrip uses
 * (src/components/dashboard/dashboard-home.tsx), so a report's KPI band
 * looks like it belongs to the same product instead of a bolted-on widget.
 */
const TONE_ICON_CLASS: Record<ReportColumnTone, string> = {
  primary: "bg-[var(--primary-soft)] text-[var(--primary)]",
  success: "bg-[var(--success-soft)] text-[var(--success)]",
  warning: "bg-[var(--warning-soft)] text-[var(--warning)]",
  danger: "bg-[var(--danger-soft)] text-[var(--danger)]",
  accent: "bg-[var(--accent-soft)] text-[var(--accent)]",
  muted: "bg-[var(--surface-muted)] text-[var(--muted)]",
};

const TONE_DOT_CLASS: Record<ReportColumnTone, string> = {
  primary: "bg-[var(--primary)]",
  success: "bg-[var(--success)]",
  warning: "bg-[var(--warning)]",
  danger: "bg-[var(--danger)]",
  accent: "bg-[var(--accent)]",
  muted: "bg-[var(--muted)]",
};

export function ReportKpiBand({
  rows,
  cards,
}: {
  rows: Record<string, unknown>[];
  cards: KpiCardSpec[];
}) {
  if (!cards.length) return null;

  return (
    <div className="stat-strip">
      {cards.map((card) => {
        const value = computeKpiCardValue(rows, card);
        return (
          <div key={card.id} className="stat-strip-item">
            <span
              className={cn(
                "stat-strip-icon",
                TONE_ICON_CLASS[card.tone] ?? TONE_ICON_CLASS.muted,
              )}
            >
              <span
                className={cn(
                  "h-2.5 w-2.5 rounded-full",
                  TONE_DOT_CLASS[card.tone] ?? TONE_DOT_CLASS.muted,
                )}
              />
            </span>
            <div className="min-w-0">
              <p className="stat-strip-label">{card.labelFa}</p>
              <p className="stat-strip-value">{formatKpiValue(value, card.format)}</p>
              {card.hintFa ? <p className="stat-strip-hint">{card.hintFa}</p> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
