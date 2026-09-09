import type { BusinessEntityDef } from "../types";

/**
 * Open receivable notes (چک‌های دریافتنی باز) — every note still sitting
 * with the company, a bank, or a collection agent (State 1/2/29, see the
 * lookup table in src/lib/rules/packs/finance-daily.ts). `daysUntilDue`
 * negative means overdue; this single entity backs both the
 * "overdue" and "due soon" rules instead of two near-duplicate SQL queries.
 *
 * Field names here are the entity's public contract — rule evaluate()
 * functions and any future dashboard widget depend on them.
 */
export interface ReceivableRecord {
  [key: string]: unknown;
  externalId: string;
  serialNumber: string;
  counterpartName: string;
  counterpartCode: string;
  bankName: string;
  accountNumber: string;
  amount: number;
  dueDate: string;
  /** DATEDIFF(day, today, dueDate) computed in SQL at sync time — negative = overdue. */
  daysUntilDue: number;
  noteState: number;
}

export const receivableEntity: BusinessEntityDef<ReceivableRecord> = {
  key: "Receivable",
  labelFa: "چک دریافتنی باز",
  idField: "externalId",
  module: "RPA",
  titleField: "counterpartName",
  amountField: "amount",
  refDateField: "dueDate",
  fields: [
    { key: "daysUntilDue", labelFa: "روز تا سررسید (منفی = گذشته)", type: "number" },
    { key: "amount", labelFa: "مبلغ (ریال)", type: "number" },
    { key: "counterpartName", labelFa: "نام طرف‌حساب", type: "string" },
    { key: "counterpartCode", labelFa: "کد تفصیلی", type: "string" },
    { key: "bankName", labelFa: "بانک", type: "string" },
    { key: "noteState", labelFa: "وضعیت چک (کد)", type: "number" },
  ],
  sourceSql: `
SELECT
  CAST(rn.ReceivableNoteID AS varchar(20)) AS externalId,
  CAST(rn.SerialNumber AS varchar(50)) AS serialNumber,
  COALESCE(p.CompanyName, p.FullName, dl.Title, N'طرف‌حساب نامشخص') AS counterpartName,
  ISNULL(dl.Code, N'—') AS counterpartCode,
  ISNULL(bnk.Name, N'—') AS bankName,
  ISNULL(rn.AccountNumber, N'—') AS accountNumber,
  rn.Amount AS amount,
  rn.DueDate AS dueDate,
  DATEDIFF(day, CAST(GETDATE() AS date), rn.DueDate) AS daysUntilDue,
  rn.State AS noteState
FROM RPA3.ReceivableNote rn
LEFT JOIN FIN3.DL dl ON dl.DLID = rn.CounterPartRef
LEFT JOIN GNR3.Party p ON p.PartyID = dl.ReferenceID
LEFT JOIN RPA3.Bank bnk ON bnk.BankID = rn.BankRef
WHERE rn.NoteType = 1
  AND rn.State IN (1, 2, 29)`.trim(),
};
