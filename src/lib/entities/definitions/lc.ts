import { loadSqlFile } from "@/lib/reports/sql-loader";
import type { BusinessEntityDef } from "../types";

/**
 * Letters of credit (اعتبارات اسنادی) — Layer 2 of
 * docs/architecture/lc-monitoring.md. One row per LC detail account, which
 * in this customer's data is exactly 1:1 with (شماره گشایش × شماره سفارش) —
 * same grain as the lc-summary report.
 *
 * `sourceSql` loads lc-entity.sql, which `@include`s the exact settlement
 * pipeline (FIFO allocation over a CURSOR + temp tables) that lc.sql and
 * lc-summary.sql already share via lc-core.sql, with every report parameter
 * pinned to NULL — the unfiltered full scan. That settlement can't be
 * expressed as this entity's own single SELECT (see the doc's Layer 2
 * section), so the file is loaded rather than re-derived here; correcting
 * the settlement logic in one place reaches every report and this entity.
 *
 * `daysUntilDue` mirrors Receivable's field of the same name on purpose
 * (negative = overdue) — see src/lib/rules/packs/lc.ts, which reads exactly
 * that sign convention, same as it already does for Receivable.
 *
 * Filed under FIN (CFO), not IPR (foreign trade): this customer books LCs
 * through the general ledger, never through the unused IPR3 module — see
 * the doc's §4.
 */
export interface LetterOfCreditRecord {
  [key: string]: unknown;
  externalId: string;
  orderNumber: string | null;
  lcIdentifier: string | null;
  bankName: string | null;
  counterpartName: string | null;
  openingAmount: number | null;
  openingDate: string | null;
  totalInvoiced: number;
  usagePct: number | null;
  netPayable: number;
  totalPaid: number;
  remainingDebt: number;
  surplusPayment: number;
  nextDueDate: string | null;
  /** DATEDIFF(day, today, nextDueDate) — negative = overdue, null = nothing open. */
  daysUntilDue: number | null;
  overdueAmount: number;
  overdueDays: number | null;
  termDays: number | null;
  invoiceCount: number;
  unusedCredit: number | null;
  /** Count of (شماره اعتبار / سفارش / مهلت / مبلغ گشایش) that could not be parsed off the title. */
  dqFlags: number;
}

export const letterOfCreditEntity: BusinessEntityDef<LetterOfCreditRecord> = {
  key: "LetterOfCredit",
  labelFa: "اعتبار اسنادی (ال سی)",
  idField: "externalId",
  module: "FIN",
  titleField: "counterpartName",
  amountField: "remainingDebt",
  refDateField: "nextDueDate",
  fields: [
    { key: "daysUntilDue", labelFa: "روز تا سررسید (منفی = گذشته)", type: "number" },
    { key: "remainingDebt", labelFa: "مانده بدهی (ریال)", type: "number" },
    { key: "overdueAmount", labelFa: "مبلغ معوق (ریال)", type: "number" },
    { key: "overdueDays", labelFa: "قدمت معوق (روز)", type: "number" },
    { key: "usagePct", labelFa: "درصد مصرف اعتبار", type: "number" },
    { key: "unusedCredit", labelFa: "مانده اعتبار استفاده‌نشده (ریال)", type: "number" },
    { key: "openingAmount", labelFa: "مبلغ گشایش (ریال)", type: "number" },
    { key: "totalInvoiced", labelFa: "جمع اسناد واصله (ریال)", type: "number" },
    { key: "dqFlags", labelFa: "تعداد ایراد داده", type: "number" },
    { key: "bankName", labelFa: "بانک عامل", type: "string" },
    { key: "counterpartName", labelFa: "ذی‌نفع", type: "string" },
    { key: "orderNumber", labelFa: "شماره سفارش", type: "string" },
    { key: "termDays", labelFa: "مهلت (روز)", type: "number" },
    { key: "invoiceCount", labelFa: "تعداد فاکتور", type: "number" },
  ],
  sourceSql: loadSqlFile("lc-entity.sql"),
};
