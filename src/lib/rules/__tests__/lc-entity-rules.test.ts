import { describe, expect, it } from "vitest";

import {
  dataQualityEvaluate,
  dueSoonEvaluate,
  overdueEvaluate,
  overUtilisedEvaluate,
  unusedCreditEvaluate,
} from "@/lib/rules/packs/lc";
import type { LetterOfCreditRecord } from "@/lib/entities/registry";

function record(overrides: Partial<LetterOfCreditRecord>): LetterOfCreditRecord {
  return {
    externalId: "1::2::3",
    orderNumber: "04130282",
    lcIdentifier: "1404281696948/5946904435134691",
    bankName: "بانک صادرات",
    counterpartName: "شرکت نمونه",
    openingAmount: 1_000_000_000,
    openingDate: "2025-01-01T00:00:00.000Z",
    totalInvoiced: 500_000_000,
    usagePct: 50,
    netPayable: 450_000_000,
    totalPaid: 450_000_000,
    remainingDebt: 0,
    surplusPayment: 0,
    nextDueDate: "2026-03-01T00:00:00.000Z",
    daysUntilDue: 0,
    overdueAmount: 0,
    overdueDays: null,
    termDays: 60,
    invoiceCount: 3,
    unusedCredit: 500_000_000,
    dqParseFlags: 0,
    dqNoOpening: 0,
    ...overrides,
  };
}

describe("overdueEvaluate", () => {
  it("includes only LCs with an outstanding balance past their due date", () => {
    const findings = overdueEvaluate([
      record({ externalId: "overdue", remainingDebt: 100, daysUntilDue: -3 }),
      record({ externalId: "settled-late", remainingDebt: 0, daysUntilDue: -3 }),
      record({ externalId: "future", remainingDebt: 100, daysUntilDue: 5 }),
      record({ externalId: "nothing-open", remainingDebt: 0, daysUntilDue: null, nextDueDate: null }),
    ]);
    expect(findings.map((f) => f.entity_id)).toEqual(["overdue"]);
  });

  it("reports the overdue day count as a positive number in the detail text", () => {
    const [finding] = overdueEvaluate([record({ remainingDebt: 100, daysUntilDue: -6 })]);
    expect(finding.detail).toContain("6 روز گذشته");
  });

  it("sorts oldest due date first", () => {
    const findings = overdueEvaluate([
      record({ externalId: "a", remainingDebt: 1, nextDueDate: "2026-02-20T00:00:00.000Z", daysUntilDue: -5 }),
      record({ externalId: "b", remainingDebt: 1, nextDueDate: "2026-02-10T00:00:00.000Z", daysUntilDue: -15 }),
    ]);
    expect(findings.map((f) => f.entity_id)).toEqual(["b", "a"]);
  });
});

describe("dueSoonEvaluate", () => {
  it("excludes already-overdue, far-future and fully-settled LCs", () => {
    const findings = dueSoonEvaluate(
      [
        record({ externalId: "overdue", remainingDebt: 1, daysUntilDue: -1 }),
        record({ externalId: "soon", remainingDebt: 1, daysUntilDue: 3 }),
        record({ externalId: "far", remainingDebt: 1, daysUntilDue: 30 }),
        record({ externalId: "settled", remainingDebt: 0, daysUntilDue: 3 }),
      ],
      { horizonDays: 7 },
    );
    expect(findings.map((f) => f.entity_id)).toEqual(["soon"]);
  });

  it("defaults the horizon to 7 days when no override is given", () => {
    const findings = dueSoonEvaluate(
      [record({ externalId: "in-8-days", remainingDebt: 1, daysUntilDue: 8 })],
      {},
    );
    expect(findings).toHaveLength(0);
  });

  it("respects a widened horizon override", () => {
    const findings = dueSoonEvaluate(
      [record({ externalId: "in-8-days", remainingDebt: 1, daysUntilDue: 8 })],
      { horizonDays: 10 },
    );
    expect(findings.map((f) => f.entity_id)).toEqual(["in-8-days"]);
  });
});

describe("overUtilisedEvaluate", () => {
  it("flags only LCs whose invoiced total exceeds the opening amount", () => {
    const findings = overUtilisedEvaluate([
      record({ externalId: "over", openingAmount: 100, totalInvoiced: 150 }),
      record({ externalId: "under", openingAmount: 100, totalInvoiced: 80 }),
      record({ externalId: "no-opening", openingAmount: null, totalInvoiced: 80 }),
    ]);
    expect(findings.map((f) => f.entity_id)).toEqual(["over"]);
    expect(findings[0].amount).toBe(50);
  });
});

describe("unusedCreditEvaluate", () => {
  const now = Date.now();

  it("flags LCs opened long enough ago with zero invoices", () => {
    const findings = unusedCreditEvaluate(
      [
        record({
          externalId: "stale",
          openingAmount: 100,
          totalInvoiced: 0,
          openingDate: new Date(now - 40 * 86_400_000).toISOString(),
        }),
        record({
          externalId: "fresh",
          openingAmount: 100,
          totalInvoiced: 0,
          openingDate: new Date(now - 5 * 86_400_000).toISOString(),
        }),
        record({
          externalId: "used",
          openingAmount: 100,
          totalInvoiced: 50,
          openingDate: new Date(now - 40 * 86_400_000).toISOString(),
        }),
      ],
      {},
    );
    expect(findings.map((f) => f.entity_id)).toEqual(["stale"]);
  });
});

describe("dataQualityEvaluate", () => {
  it("only includes LCs with at least one unparsed field, worst first", () => {
    const findings = dataQualityEvaluate([
      record({ externalId: "clean", dqParseFlags: 0 }),
      record({ externalId: "minor", dqParseFlags: 1 }),
      record({ externalId: "major", dqParseFlags: 3 }),
    ]);
    expect(findings.map((f) => f.entity_id)).toEqual(["major", "minor"]);
  });

  it("does not flag an LC that only has no matching opening record", () => {
    const findings = dataQualityEvaluate([
      record({ externalId: "no-opening-only", dqParseFlags: 0, dqNoOpening: 1 }),
    ]);
    expect(findings).toHaveLength(0);
  });
});
