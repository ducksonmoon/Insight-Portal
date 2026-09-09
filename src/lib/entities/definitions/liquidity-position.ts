import type { BusinessEntityDef } from "../types";

/**
 * One row per bank: current account balance vs. payable notes due in the
 * next 7 days at that same bank. This is the brief's own flagship worked
 * example (§20 — "Current Bank Balance = 20B, Payments due next 7 days =
 * 28B, Gap = -8B") — see docs/architecture/management-intelligence-platform.md
 * §7 for why the join lives here instead of in the rule DSL: a business-user
 * condition should stay a single-entity comparison, not a query planner.
 *
 * Two real, already-proven Rahkaran sources combined:
 *   - Balance: RPA3.BankAccount + RPA3.BankAccountTransaction, the same
 *     running-balance calculation src/lib/reports/sql/bank-balance.sql
 *     already uses in production (its "EndingBalance" column), simplified
 *     to "as of now" and rolled up per bank rather than per account/branch.
 *   - Obligations: the exact same WHERE clause as the predefined rule
 *     rpa.payable.cash_requirement, whose own fixHintFa already says
 *     "compare each account's balance with this amount" — this entity is
 *     that comparison, automated.
 *
 * The 7-day horizon is fixed at materialization time (matches the brief's
 * example and the predefined rule's default) rather than a rule parameter —
 * a configurable horizon would need a second entity or a redesign; not
 * built until a real need asks for it.
 */
export interface LiquidityPositionRecord {
  [key: string]: unknown;
  externalId: string;
  bankName: string;
  bankBalance: number;
  next7dObligations: number;
  gap: number;
}

export const liquidityPositionEntity: BusinessEntityDef<LiquidityPositionRecord> = {
  key: "LiquidityPosition",
  labelFa: "وضعیت نقدینگی به تفکیک بانک",
  idField: "externalId",
  module: "RPA",
  titleField: "bankName",
  amountField: "gap",
  fields: [
    { key: "bankBalance", labelFa: "موجودی بانک (ریال)", type: "number" },
    { key: "next7dObligations", labelFa: "تعهدات ۷ روز آینده (ریال)", type: "number" },
    { key: "gap", labelFa: "کسری/مازاد نقدینگی (ریال)", type: "number" },
  ],
  sourceSql: `
SELECT
  CAST(b.BankID AS varchar(20)) AS externalId,
  b.Name AS bankName,
  ISNULL(bal.balance, 0) AS bankBalance,
  ISNULL(oblig.dueAmount, 0) AS next7dObligations,
  ISNULL(bal.balance, 0) - ISNULL(oblig.dueAmount, 0) AS gap
FROM RPA3.Bank b
LEFT JOIN (
  SELECT bb.BankRef AS BankID, SUM(bat.Debit - bat.Credit) AS balance
  FROM RPA3.BankAccount ba
  INNER JOIN RPA3.BankBranch bb ON ba.BankBranchRef = bb.BankBranchID
  LEFT JOIN RPA3.BankAccountTransaction bat ON bat.BankAccountRef = ba.BankAccountID
    AND bat.LedgerRef = 1
  WHERE ba.LedgerRef = 1
  GROUP BY bb.BankRef
) bal ON bal.BankID = b.BankID
LEFT JOIN (
  SELECT bnk.BankID, SUM(pn.Amount) AS dueAmount
  FROM RPA3.PayableNote pn
  JOIN RPA3.Bank bnk ON bnk.BankID = pn.BankRef
  WHERE pn.State IN (1, 2, 29)
    AND pn.DueDate BETWEEN CAST(GETDATE() AS date) AND DATEADD(day, 7, CAST(GETDATE() AS date))
  GROUP BY bnk.BankID
) oblig ON oblig.BankID = b.BankID
WHERE bal.balance IS NOT NULL OR oblig.dueAmount IS NOT NULL`.trim(),
};
