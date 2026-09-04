import type { Rule } from "../types";

/**
 * Library C — payables commitment control.
 *
 * Rahkaran's own "دستور پرداخت" (Payment Order) screen shows a party's account
 * balance from POSTED vouchers only. It has no idea how many other payment
 * orders are already queued against the same party but not yet vouchered — so
 * a company can authorize more payment orders than a creditor's real remaining
 * balance covers, and Rahkaran's UI will not warn anyone. These two rules close
 * that gap:
 *
 *   - rpa.paymentorder.pending_exceeds_balance: sums every *pending* (not yet
 *     paid/cancelled) payment order line per creditor and nets it against their
 *     real posted balance. Negative remainder = already over-committed.
 *   - fin.party.debtor_since: for a receivable-style account, walks the ledger
 *     chronologically to find the exact date a party's balance last crossed
 *     from zero-or-credit into an unbroken debtor streak — real ageing, not a
 *     single "days since due date" approximation.
 *
 * IMPORTANT — customer-specific configuration required:
 * `TARGET_SL_CODES` below MUST be replaced with this customer's own SL (معین)
 * codes before running against their real database. These are never guessed:
 * ask the finance manager which accounts they mean (for Bahman Steel, this was
 * raised explicitly — confirm the exact codes with them directly).
 *
 * A note on data shape: in this schema roughly half of all VoucherItem.Debit /
 * .Credit values are NULL (not zero) — Rahkaran only populates the side of the
 * entry that applies. Every row-level arithmetic below uses ISNULL(...,0)
 * before adding or subtracting; SUM(column) alone is safe because SQL Server's
 * SUM already ignores NULLs, but `SUM(a - b)` or `a + b` at the row level is
 * not, and silently drops half the rows if left unguarded. Verified against a
 * live Rahkaran database, not assumed.
 */

/**
 * Which two SL (معین) codes these rules watch. Configured per customer via
 * `PAYABLES_WATCH_SL_CODES` (comma-separated, e.g. "211209,211210") in
 * .env.local — never hardcoded, since every customer's chart of accounts is
 * different. Left unset, both rules run against a code no account will ever
 * match and simply return zero findings rather than erroring.
 */
const TARGET_SL_CODES = (process.env.PAYABLES_WATCH_SL_CODES ?? "__unconfigured__")
  .split(",")
  .map((code) => code.trim())
  .filter(Boolean);

const slCodeList = TARGET_SL_CODES.map((code) => `N'${code.replace(/'/g, "")}'`).join(", ");

export const financePayablesRules: Rule[] = [
  {
    id: "rpa.paymentorder.pending_exceeds_balance",
    module: "RPA",
    pack: "daily",
    severity: "critical",
    titleFa: "دستورهای پرداخت معلق از مانده واقعی بستانکار بیشتر شده",
    descriptionFa:
      "برای هر بستانکار، مجموع دستورهای پرداختِ هنوز ثبت‌نشده (سند نخورده) با ماندهٔ واقعیِ ثبت‌شدهٔ او مقایسه می‌شود.",
    whyItMattersFa:
      "فرم دستور پرداخت راهکاران فقط ماندهٔ اسناد قطعی‌شده را نشان می‌دهد و از دستورهای پرداخت دیگری که هنوز در صف هستند خبر ندارد. اگر مجموع دستورهای معلق از مانده واقعی بیشتر شود، شرکت در حال تعهد پرداختی است که پول کافی برایش وجود ندارد — و هیچ‌جای راهکاران این را هشدار نمی‌دهد.",
    fixHintFa:
      "قبل از تأیید دستور پرداخت جدید برای این بستانکار، صف دستورهای معلق را بررسی و اولویت‌بندی کنید.",
    sql: `
;WITH sl_codes AS (
    SELECT SLID FROM FIN3.SL WHERE Code IN (${slCodeList})
),
posted_balance AS (
    SELECT vi.PartyRef, SUM(vi.Credit) - SUM(vi.Debit) AS balance
    FROM FIN3.VoucherItem vi
    JOIN FIN3.Voucher v ON v.VoucherID = vi.VoucherRef
    WHERE vi.SLRef IN (SELECT SLID FROM sl_codes)
      AND v.State = 32
      AND vi.PartyRef IS NOT NULL
    GROUP BY vi.PartyRef
),
pending_committed AS (
    -- pol.CounterPartRef points at FIN3.DL, not GNR3.Party directly — resolve
    -- through DL.ReferenceID so this lines up with posted_balance's PartyRef.
    SELECT dl.ReferenceID AS PartyRef, SUM(pol.Amount) AS pending_amount
    FROM RPA3.PaymentOrderList pol
    JOIN RPA3.PaymentOrder po ON po.PaymentOrderID = pol.PaymentOrderRef
    JOIN FIN3.DL dl ON dl.DLID = pol.CounterPartRef
    WHERE pol.SLRef IN (SELECT SLID FROM sl_codes)
      AND po.State IN (1, 2, 3)
      AND dl.ReferenceID IS NOT NULL
    GROUP BY dl.ReferenceID
)
SELECT
  p.PartyID AS entity_id,
  COALESCE(p.CompanyName, p.FullName, N'طرف‌حساب نامشخص') AS title,
  CONCAT(N'مانده واقعی ', FORMAT(ISNULL(pb.balance, 0), 'N0'),
         N' ریال — دستورهای معلق ', FORMAT(pc.pending_amount, 'N0'),
         N' ریال — کسری ', FORMAT(pc.pending_amount - ISNULL(pb.balance, 0), 'N0'), N' ریال') AS detail,
  ISNULL(pb.balance, 0) - pc.pending_amount AS amount,
  CAST(NULL AS datetime) AS ref_date
FROM pending_committed pc
JOIN GNR3.Party p ON p.PartyID = pc.PartyRef
LEFT JOIN posted_balance pb ON pb.PartyRef = pc.PartyRef
WHERE ISNULL(pb.balance, 0) - pc.pending_amount < 0
ORDER BY (ISNULL(pb.balance, 0) - pc.pending_amount) ASC`.trim(),
  },

  {
    id: "fin.party.debtor_since",
    module: "FIN",
    pack: "daily",
    severity: "high",
    titleFa: "تجزیهٔ سنی دقیق — بدهکار از چه تاریخی",
    descriptionFa:
      "برای طرف‌حساب‌هایی که مانده بدهکار دارند، تاریخ دقیقی که مانده برای آخرین‌بار مثبت شد و از آن پس هرگز صفر یا منفی نشد.",
    whyItMattersFa:
      "برخلاف تجزیهٔ سنی معمولی که فقط بر مبنای سررسید هر سند حساب می‌کند، این روش کل تاریخچهٔ حساب را می‌خواند و می‌گوید واقعاً از چه روزی این بدهی پیوسته برقرار بوده — دقیقاً همان چیزی که برای پیگیری وصول لازم است.",
    fixHintFa: "با طرف‌حساب از تاریخ نمایش‌داده‌شده پیگیری وصول را شروع کنید.",
    sql: `
;WITH sl_codes AS (
    SELECT SLID FROM FIN3.SL WHERE Code IN (${slCodeList})
),
tx AS (
    SELECT
        vi.PartyRef,
        v.Date,
        vi.VoucherItemID,
        ISNULL(vi.Debit, 0) - ISNULL(vi.Credit, 0) AS delta
    FROM FIN3.VoucherItem vi
    JOIN FIN3.Voucher v ON v.VoucherID = vi.VoucherRef
    WHERE vi.SLRef IN (SELECT SLID FROM sl_codes)
      AND v.State = 32
      AND vi.PartyRef IS NOT NULL
),
running AS (
    SELECT *,
        SUM(delta) OVER (PARTITION BY PartyRef ORDER BY Date, VoucherItemID
                          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_balance
    FROM tx
),
last_nonpositive AS (
    SELECT PartyRef, MAX(Date) AS last_nonpositive_date
    FROM running
    WHERE running_balance <= 0
    GROUP BY PartyRef
),
current_balance AS (
    SELECT PartyRef, SUM(delta) AS balance
    FROM tx
    GROUP BY PartyRef
)
SELECT
  p.PartyID AS entity_id,
  COALESCE(p.CompanyName, p.FullName, N'طرف‌حساب نامشخص') AS title,
  CONCAT(N'از تاریخ ', SYS3.fn_DateToShamsiDate(
    COALESCE(
        (SELECT MIN(Date) FROM running r WHERE r.PartyRef = cb.PartyRef AND r.Date > ln.last_nonpositive_date),
        (SELECT MIN(Date) FROM running r WHERE r.PartyRef = cb.PartyRef)
    )), N' پیوسته بدهکار است') AS detail,
  cb.balance AS amount,
  COALESCE(
      (SELECT MIN(Date) FROM running r WHERE r.PartyRef = cb.PartyRef AND r.Date > ln.last_nonpositive_date),
      (SELECT MIN(Date) FROM running r WHERE r.PartyRef = cb.PartyRef)
  ) AS ref_date
FROM current_balance cb
JOIN GNR3.Party p ON p.PartyID = cb.PartyRef
LEFT JOIN last_nonpositive ln ON ln.PartyRef = cb.PartyRef
WHERE cb.balance > 0
ORDER BY cb.balance DESC`.trim(),
  },
];
