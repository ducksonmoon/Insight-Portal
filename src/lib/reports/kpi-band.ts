import { evaluateCondition } from "@/lib/entities/condition";
import type { KpiCardSpec } from "@/types/report";

/**
 * Pure aggregation behind a report's KPI band (see
 * src/components/reports/report-kpi-band.tsx) — kept in its own plain
 * module, separate from the "use client" component, so it can be unit
 * tested directly (the project's vitest config only picks up `*.test.ts`
 * under a node environment, with no JSX transform).
 */
export function computeKpiCardValue(
  rows: Record<string, unknown>[],
  card: KpiCardSpec,
): number {
  const matched = card.condition
    ? rows.filter((row) => evaluateCondition(card.condition!, row))
    : rows;

  if (card.aggregate.op === "count") return matched.length;

  const field = card.aggregate.field;
  if (!field) return 0;
  return matched.reduce((sum, row) => sum + (Number(row[field]) || 0), 0);
}

export function formatKpiValue(value: number, format?: KpiCardSpec["format"]): string {
  if (!Number.isFinite(value)) return "—";
  if (format === "amount") return new Intl.NumberFormat("en-US").format(Math.round(value));
  return new Intl.NumberFormat("en-US").format(value);
}
