import { describe, expect, it } from "vitest";

import { dueSoonEvaluate, overdueUncollectedEvaluate } from "@/lib/rules/packs/finance-daily";
import type { ReceivableRecord } from "@/lib/entities/registry";

function record(overrides: Partial<ReceivableRecord>): ReceivableRecord {
  return {
    externalId: "1",
    serialNumber: "1001",
    counterpartName: "شرکت نمونه",
    counterpartCode: "1101",
    bankName: "ملی",
    accountNumber: "555",
    amount: 1_000_000,
    dueDate: "2026-03-01T00:00:00.000Z",
    daysUntilDue: 0,
    noteState: 1,
    ...overrides,
  };
}

describe("overdueUncollectedEvaluate", () => {
  it("includes only notes past their due date", () => {
    const findings = overdueUncollectedEvaluate([
      record({ externalId: "overdue", daysUntilDue: -3 }),
      record({ externalId: "today", daysUntilDue: 0 }),
      record({ externalId: "future", daysUntilDue: 5 }),
    ]);
    expect(findings.map((f) => f.entity_id)).toEqual(["overdue"]);
  });

  it("reports the overdue day count as a positive number in the detail text", () => {
    const [finding] = overdueUncollectedEvaluate([record({ daysUntilDue: -6 })]);
    expect(finding.detail).toContain("6 روز گذشته");
  });

  it("sorts oldest due date first", () => {
    const findings = overdueUncollectedEvaluate([
      record({ externalId: "a", dueDate: "2026-02-20T00:00:00.000Z", daysUntilDue: -5 }),
      record({ externalId: "b", dueDate: "2026-02-10T00:00:00.000Z", daysUntilDue: -15 }),
    ]);
    expect(findings.map((f) => f.entity_id)).toEqual(["b", "a"]);
  });
});

describe("dueSoonEvaluate", () => {
  it("excludes already-overdue and far-future notes", () => {
    const findings = dueSoonEvaluate(
      [
        record({ externalId: "overdue", daysUntilDue: -1 }),
        record({ externalId: "soon", daysUntilDue: 3 }),
        record({ externalId: "far", daysUntilDue: 30 }),
      ],
      { horizonDays: 7 },
    );
    expect(findings.map((f) => f.entity_id)).toEqual(["soon"]);
  });

  it("defaults the horizon to 7 days when no override is given", () => {
    const findings = dueSoonEvaluate(
      [record({ externalId: "in-8-days", daysUntilDue: 8 })],
      {},
    );
    expect(findings).toHaveLength(0);
  });

  it("respects a widened horizon override", () => {
    const findings = dueSoonEvaluate(
      [record({ externalId: "in-8-days", daysUntilDue: 8 })],
      { horizonDays: 10 },
    );
    expect(findings.map((f) => f.entity_id)).toEqual(["in-8-days"]);
  });
});
