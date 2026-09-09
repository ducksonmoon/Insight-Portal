import { describe, expect, it } from "vitest";

import { cashShortfallEvaluate } from "@/lib/rules/packs/finance-daily";
import type { LiquidityPositionRecord } from "@/lib/entities/registry";

function record(overrides: Partial<LiquidityPositionRecord>): LiquidityPositionRecord {
  return {
    externalId: "1",
    bankName: "بانک ملی",
    bankBalance: 1_000_000_000,
    next7dObligations: 500_000_000,
    gap: 500_000_000,
    ...overrides,
  };
}

describe("cashShortfallEvaluate", () => {
  it("flags only banks with a negative gap", () => {
    const findings = cashShortfallEvaluate([
      record({ externalId: "surplus", bankBalance: 1000, next7dObligations: 500, gap: 500 }),
      record({ externalId: "shortfall", bankBalance: 500, next7dObligations: 1000, gap: -500 }),
      record({ externalId: "exact", bankBalance: 500, next7dObligations: 500, gap: 0 }),
    ]);
    expect(findings.map((f) => f.entity_id)).toEqual(["shortfall"]);
  });

  it("reports the shortfall as a positive number in the detail text", () => {
    const [finding] = cashShortfallEvaluate([
      record({ bankBalance: 20_000_000_000, next7dObligations: 28_000_000_000, gap: -8_000_000_000 }),
    ]);
    expect(finding.detail).toContain(new Intl.NumberFormat("fa-IR").format(8_000_000_000));
    expect(finding.amount).toBe(-8_000_000_000);
  });

  it("sorts worst (most negative) gap first", () => {
    const findings = cashShortfallEvaluate([
      record({ externalId: "small", gap: -1000 }),
      record({ externalId: "big", gap: -1_000_000 }),
    ]);
    expect(findings.map((f) => f.entity_id)).toEqual(["big", "small"]);
  });

  it("returns nothing when every bank covers its near-term obligations", () => {
    const findings = cashShortfallEvaluate([record({ gap: 1 }), record({ externalId: "2", gap: 0 })]);
    expect(findings).toHaveLength(0);
  });
});
