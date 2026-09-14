import { describe, expect, it } from "vitest";

import { computeKpiCardValue, formatKpiValue } from "@/lib/reports/kpi-band";
import type { KpiCardSpec } from "@/types/report";

const rows: Record<string, unknown>[] = [
  { "وضعیت": "معوق", "اولویت وضعیت": 1, "مبلغ معوق": 100, "هشدار": "2 ایراد داده" },
  { "وضعیت": "سررسید امروز", "اولویت وضعیت": 2, "مبلغ معوق": 0, "هشدار": null },
  { "وضعیت": "تسویه شده", "اولویت وضعیت": 6, "مبلغ معوق": 0, "هشدار": null },
];

describe("computeKpiCardValue", () => {
  it("counts all rows when no condition is given", () => {
    const card: KpiCardSpec = { id: "c", labelFa: "x", tone: "muted", aggregate: { op: "count" } };
    expect(computeKpiCardValue(rows, card)).toBe(3);
  });

  it("counts only rows matching the condition", () => {
    const card: KpiCardSpec = {
      id: "open",
      labelFa: "x",
      tone: "muted",
      aggregate: { op: "count" },
      condition: { field: "اولویت وضعیت", op: "lte", value: 4 },
    };
    expect(computeKpiCardValue(rows, card)).toBe(2);
  });

  it("sums a numeric field across matching rows", () => {
    const card: KpiCardSpec = {
      id: "overdue",
      labelFa: "x",
      tone: "danger",
      aggregate: { op: "sum", field: "مبلغ معوق" },
    };
    expect(computeKpiCardValue(rows, card)).toBe(100);
  });

  it("returns 0 for a sum card with no field", () => {
    const card: KpiCardSpec = { id: "bad", labelFa: "x", tone: "muted", aggregate: { op: "sum" } };
    expect(computeKpiCardValue(rows, card)).toBe(0);
  });

  it("supports a contains condition for text fields like هشدار", () => {
    const card: KpiCardSpec = {
      id: "dq",
      labelFa: "x",
      tone: "warning",
      aggregate: { op: "count" },
      condition: { field: "هشدار", op: "contains", value: "ایراد داده" },
    };
    expect(computeKpiCardValue(rows, card)).toBe(1);
  });
});

describe("formatKpiValue", () => {
  it("formats amounts with thousands separators", () => {
    expect(formatKpiValue(1234567, "amount")).toBe("1,234,567");
  });

  it("formats plain counts without decimals", () => {
    expect(formatKpiValue(42)).toBe("42");
  });

  it("falls back to an em dash for non-finite values", () => {
    expect(formatKpiValue(NaN)).toBe("—");
  });
});
