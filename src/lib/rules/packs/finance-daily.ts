import type { Rule } from "../types";

/**
 * Library B — the finance manager's morning panel.
 *
 * Every rule here answers "what needs my attention today?". Note that several of
 * these detect a *non-event* (money that should have arrived and did not) — which
 * is precisely what a BI dashboard cannot express, because it can only draw what
 * happened, not what failed to happen.
 *
 * Lookup values from SYS3:
 *   NoteType   1=چک  2=سفته
 *   NoteState  open: 1=نزد صندوق  2=نزد بانک  29=نزد مأمور وصول  (negatives = در انتظار …)
 *              closed: 3=وصول شده  11=پرداخت شده  33=تسویه شده  34=سوخت شده  23=ابطال شده
 *              trouble: 4=واخواست شده  17=حقوقی شده
 *   VoucherState 1=موقت  4=بررسی شده  8=در حال بررسی  32=قطعی شده
 *
 * IMPORTANT — CounterPartRef is not a Party id.
 * `ReceivableNote.CounterPartRef` / `PayableNote.CounterPartRef` /
 * `PaymentOrderList.CounterPartRef` all point at `FIN3.DL` (the تفصیلی row),
 * not directly at `GNR3.Party`. Joining `GNR3.Party` on CounterPartRef looks
 * like it works — DL ids and Party ids overlap for a lot of rows — but
 * silently returns NULL for any row where they diverge (confirmed on a real
 * database). The correct path is DL → DL.ReferenceID → Party. `dl.Code` is
 * also worth surfacing on its own: it's the تفصیلی code a user can paste into
 * Rahkaran's own search to pull up the exact same account.
 */
export const financeDailyRules: Rule[] = [
  {
    id: "rpa.receivable.overdue_uncollected",
    module: "RPA",
    pack: "daily",
    severity: "critical",
    titleFa: "چک‌هایی که باید وصول می‌شد و نشد",
    descriptionFa: "چک‌های دریافتنی که سررسیدشان گذشته اما هنوز وصول نشده‌اند.",
    whyItMattersFa:
      "این پول امروز باید در حساب شرکت می‌بود و نیست. هر روز تأخیر یعنی هزینهٔ نقدینگی و ریسک برگشت خوردن.",
    fixHintFa: "با طرف‌حساب تماس بگیرید و وضعیت چک را در راهکاران به‌روز کنید.",
    sql: `
SELECT
  rn.ReceivableNoteID AS entity_id,
  CONCAT(N'چک ', rn.SerialNumber, N' — ', COALESCE(p.CompanyName, p.FullName, dl.Title, N'طرف‌حساب نامشخص')) AS title,
  CONCAT(N'تفصیلی ', ISNULL(dl.Code, N'—'),
         N' — بانک ', ISNULL(bnk.Name, N'—'), N' — شماره حساب ', ISNULL(rn.AccountNumber, N'—'),
         N' — سررسید ', SYS3.fn_DateToShamsiDate(rn.DueDate),
         N' — ', DATEDIFF(day, rn.DueDate, GETDATE()), N' روز گذشته و هنوز وصول نشده') AS detail,
  rn.Amount AS amount,
  rn.DueDate AS ref_date
FROM RPA3.ReceivableNote rn
LEFT JOIN FIN3.DL dl ON dl.DLID = rn.CounterPartRef
LEFT JOIN GNR3.Party p ON p.PartyID = dl.ReferenceID
LEFT JOIN RPA3.Bank bnk ON bnk.BankID = rn.BankRef
WHERE rn.NoteType = 1
  AND rn.DueDate < CAST(GETDATE() AS date)
  AND rn.State IN (1, 2, 29)
ORDER BY rn.DueDate ASC`.trim(),
  },

  {
    id: "rpa.receivable.dishonoured",
    module: "RPA",
    pack: "daily",
    severity: "critical",
    titleFa: "چک‌های واخواست‌شده یا حقوقی",
    descriptionFa: "چک‌هایی که به مرحلهٔ واخواست یا پیگیری حقوقی رسیده‌اند.",
    whyItMattersFa:
      "این‌ها دیگر مطالبهٔ عادی نیستند؛ اگر پیگیری حقوقی به‌موقع انجام نشود، احتمال سوخت‌شدن طلب بالا می‌رود.",
    fixHintFa: "وضعیت پروندهٔ حقوقی را بررسی و در صورت لزوم ذخیرهٔ مطالبات مشکوک‌الوصول بگیرید.",
    sql: `
SELECT
  rn.ReceivableNoteID AS entity_id,
  CONCAT(N'چک ', rn.SerialNumber, N' — ', COALESCE(p.CompanyName, p.FullName, dl.Title, N'طرف‌حساب نامشخص')) AS title,
  CONCAT(CASE rn.State WHEN 4 THEN N'واخواست شده' ELSE N'حقوقی شده' END,
         N' — تفصیلی ', ISNULL(dl.Code, N'—'),
         N' — بانک ', ISNULL(bnk.Name, N'—'),
         N' — سررسید ', SYS3.fn_DateToShamsiDate(rn.DueDate)) AS detail,
  rn.Amount AS amount,
  rn.DueDate AS ref_date
FROM RPA3.ReceivableNote rn
LEFT JOIN FIN3.DL dl ON dl.DLID = rn.CounterPartRef
LEFT JOIN GNR3.Party p ON p.PartyID = dl.ReferenceID
LEFT JOIN RPA3.Bank bnk ON bnk.BankID = rn.BankRef
WHERE rn.State IN (4, 17)
ORDER BY rn.Amount DESC`.trim(),
  },

  {
    id: "rpa.receivable.due_soon",
    module: "RPA",
    pack: "daily",
    severity: "medium",
    titleFa: "چک‌های در شرف سررسید",
    descriptionFa: "چک‌های دریافتنی که در روزهای آینده سررسید می‌شوند.",
    whyItMattersFa:
      "پیش‌آگهی وصول: اگر امروز پیگیری شود، فردا تبدیل به «وصول نشد» نمی‌شود.",
    fixHintFa: "فهرست را به واحد وصول بدهید تا پیش از سررسید هماهنگ کنند.",
    params: [{ name: "horizonDays", labelFa: "افق پیش‌آگهی (روز)", defaultValue: 7 }],
    sql: `
SELECT
  rn.ReceivableNoteID AS entity_id,
  CONCAT(N'چک ', rn.SerialNumber, N' — ', COALESCE(p.CompanyName, p.FullName, dl.Title, N'طرف‌حساب نامشخص')) AS title,
  CONCAT(N'تفصیلی ', ISNULL(dl.Code, N'—'),
         N' — بانک ', ISNULL(bnk.Name, N'—'), N' — شماره حساب ', ISNULL(rn.AccountNumber, N'—'),
         N' — سررسید ', SYS3.fn_DateToShamsiDate(rn.DueDate),
         N' — ', DATEDIFF(day, GETDATE(), rn.DueDate), N' روز دیگر') AS detail,
  rn.Amount AS amount,
  rn.DueDate AS ref_date
FROM RPA3.ReceivableNote rn
LEFT JOIN FIN3.DL dl ON dl.DLID = rn.CounterPartRef
LEFT JOIN GNR3.Party p ON p.PartyID = dl.ReferenceID
LEFT JOIN RPA3.Bank bnk ON bnk.BankID = rn.BankRef
WHERE rn.NoteType = 1
  AND rn.State IN (1, 2, 29)
  AND rn.DueDate BETWEEN CAST(GETDATE() AS date)
                     AND DATEADD(day, {{horizonDays}}, CAST(GETDATE() AS date))
ORDER BY rn.DueDate ASC`.trim(),
  },

  {
    id: "rpa.payable.cash_requirement",
    module: "RPA",
    pack: "daily",
    severity: "high",
    titleFa: "تعهد پرداخت نزدیک، به تفکیک بانک",
    descriptionFa: "چک‌های پرداختنی که در روزهای آینده سررسید می‌شوند، گروه‌بندی‌شده بر اساس بانک.",
    whyItMattersFa:
      "نیاز نقدی هر بانک را پیش از سررسید نشان می‌دهد. برگشت‌خوردن چک شرکت گران‌ترین اشتباه ممکن است.",
    fixHintFa: "موجودی هر حساب را با این مبلغ مقایسه و در صورت کسری، انتقال وجه را برنامه‌ریزی کنید.",
    params: [{ name: "horizonDays", labelFa: "افق پیش‌آگهی (روز)", defaultValue: 7 }],
    sql: `
SELECT
  b.BankID AS entity_id,
  CONCAT(N'بانک ', b.Name) AS title,
  CONCAT(COUNT(*), N' فقره چک پرداختنی تا ', {{horizonDays}}, N' روز آینده') AS detail,
  SUM(pn.Amount) AS amount,
  MIN(pn.DueDate) AS ref_date
FROM RPA3.PayableNote pn
JOIN RPA3.Bank b ON b.BankID = pn.BankRef
WHERE pn.State IN (1, 2, 29)
  AND pn.DueDate BETWEEN CAST(GETDATE() AS date)
                     AND DATEADD(day, {{horizonDays}}, CAST(GETDATE() AS date))
GROUP BY b.BankID, b.Name
ORDER BY SUM(pn.Amount) DESC`.trim(),
  },

  {
    id: "rpa.pettycash.over_limit",
    module: "RPA",
    pack: "daily",
    severity: "high",
    titleFa: "تنخواه بیش از سقف مجاز",
    descriptionFa: "تنخواه‌گردان‌هایی که مانده‌شان از سقف تعریف‌شده عبور کرده است.",
    whyItMattersFa:
      "سقف تنخواه یک کنترل داخلی است. عبور از آن یعنی وجه نقد بیش از حد مجاز خارج از خزانه در گردش است.",
    fixHintFa: "از تنخواه‌گردان صورت‌حساب بگیرید و مانده را تسویه کنید.",
    sql: `
SELECT
  pc.PettyCashID AS entity_id,
  CONCAT(N'تنخواه ', pc.Number, N' — ', pc.Title) AS title,
  CONCAT(N'مانده ', FORMAT(SUM(t.Debit) - SUM(t.Credit), 'N0'),
         N' ریال، از سقف ', FORMAT(pc.MaximumCash, 'N0'), N' ریال عبور کرده') AS detail,
  SUM(t.Debit) - SUM(t.Credit) - pc.MaximumCash AS amount,
  MAX(t.DocumentDate) AS ref_date
FROM RPA3.PettyCash pc
JOIN RPA3.PettyCashTransaction t ON t.PettyCashRef = pc.PettyCashID
WHERE pc.MaximumCash > 0
GROUP BY pc.PettyCashID, pc.Number, pc.Title, pc.MaximumCash
HAVING SUM(t.Debit) - SUM(t.Credit) > pc.MaximumCash
ORDER BY SUM(t.Debit) - SUM(t.Credit) - pc.MaximumCash DESC`.trim(),
  },

  {
    id: "fin.voucher.stuck_in_review",
    module: "FIN",
    pack: "daily",
    severity: "medium",
    titleFa: "اسناد معلق در چرخهٔ بررسی",
    descriptionFa: "اسنادی که مدت‌هاست در وضعیت «در حال بررسی» یا «بررسی‌شده» مانده و قطعی نشده‌اند.",
    whyItMattersFa:
      "سند معلق یعنی کسی منتظر کسی است و هیچ‌کس خبر ندارد. این‌ها بستن دوره را عقب می‌اندازند.",
    fixHintFa: "مسئول بررسی را مشخص و سند را قطعی کنید.",
    params: [{ name: "stuckDays", labelFa: "آستانهٔ معلق‌ماندن (روز)", defaultValue: 14 }],
    sql: `
SELECT
  v.VoucherID AS entity_id,
  CONCAT(N'سند شماره ', v.Number, N' مورخ ', SYS3.fn_DateToShamsiDate(v.Date)) AS title,
  CONCAT(CASE v.State WHEN 8 THEN N'در حال بررسی' ELSE N'بررسی‌شده و قطعی‌نشده' END,
         N' — ', DATEDIFF(day, v.Date, GETDATE()), N' روز معلق مانده') AS detail,
  (SELECT SUM(vi.Debit) FROM FIN3.VoucherItem vi WHERE vi.VoucherRef = v.VoucherID) AS amount,
  v.Date AS ref_date
FROM FIN3.Voucher v
WHERE v.State IN (4, 8)
  AND v.Date < DATEADD(day, -{{stuckDays}}, GETDATE())
ORDER BY v.Date ASC`.trim(),
  },
];
