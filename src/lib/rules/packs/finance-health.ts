import type { Rule } from "../types";

/**
 * Library A — data integrity for the finance ledger.
 *
 * These run occasionally (not daily). Their job is to answer the question a
 * finance manager cannot answer alone: "why don't my numbers add up?"
 *
 * Lookup values used below come from SYS3 lookups:
 *   VoucherState            1=موقت  2=یادداشت  4=بررسی شده  8=در حال بررسی  32=قطعی شده
 *   AccountRemainderNature  1=مهم نیست  2=بدهکار  3=بستانکار   (FIN3.SL.Nature)
 */
export const financeHealthRules: Rule[] = [
  {
    id: "fin.voucher.unbalanced",
    module: "FIN",
    pack: "health",
    severity: "critical",
    titleFa: "سند حسابداری تراز نیست",
    descriptionFa: "اسنادی که جمع بدهکار و بستانکار آن‌ها برابر نیست.",
    whyItMattersFa:
      "هر سند ناتراز یعنی تراز آزمایشی و صورت‌های مالی به همان اندازه غلط است. تا این‌ها اصلاح نشوند، هیچ گزارش مالی قابل استناد نیست.",
    fixHintFa: "سند را در راهکاران باز کنید و ردیف جاافتاده را اصلاح یا حذف کنید.",
    sql: `
SELECT
  v.VoucherID AS entity_id,
  CONCAT(N'سند شماره ', v.Number, N' مورخ ', SYS3.fn_DateToShamsiDate(v.Date)) AS title,
  CONCAT(N'اختلاف بدهکار و بستانکار: ', FORMAT(SUM(vi.Debit) - SUM(vi.Credit), 'N0'), N' ریال') AS detail,
  SUM(vi.Debit) - SUM(vi.Credit) AS amount,
  v.Date AS ref_date
FROM FIN3.Voucher v
JOIN FIN3.VoucherItem vi ON vi.VoucherRef = v.VoucherID
GROUP BY v.VoucherID, v.Number, v.Date
HAVING SUM(vi.Debit) <> SUM(vi.Credit)
ORDER BY ABS(SUM(vi.Debit) - SUM(vi.Credit)) DESC`.trim(),
  },

  {
    id: "fin.voucheritem.missing_dl",
    module: "FIN",
    pack: "health",
    severity: "critical",
    titleFa: "معین تفصیلی‌پذیر بدون تفصیلی ثبت شده",
    descriptionFa:
      "ردیف‌هایی که روی معینِ تفصیلی‌پذیر زده شده‌اند اما هیچ سطح تفصیلی برایشان ثبت نشده است.",
    whyItMattersFa:
      "این تنها و مهم‌ترین دلیلی است که تجزیهٔ سنی و گزارش «کی از کی طلبکار است» درنمی‌آید. مبلغ در معین هست ولی به هیچ طرف‌حسابی نمی‌چسبد، پس در هیچ گزارش بدهکاران دیده نمی‌شود.",
    fixHintFa:
      "ردیف سند را اصلاح و تفصیلی طرف‌حساب را ثبت کنید. برای جلوگیری از تکرار، «کنترل ماهیت» معین را روی سطوح تفصیلی فعال کنید.",
    sql: `
SELECT
  vi.VoucherItemID AS entity_id,
  CONCAT(N'سند ', v.Number, N' / ردیف ', vi.RowNumber) AS title,
  CONCAT(N'معین ', sl.Code, N' - ', sl.Title, N' تفصیلی‌پذیر است اما این ردیف تفصیلی ندارد') AS detail,
  (ISNULL(vi.Debit, 0) + ISNULL(vi.Credit, 0)) AS amount,
  v.Date AS ref_date
FROM FIN3.VoucherItem vi
JOIN FIN3.Voucher v ON v.VoucherID = vi.VoucherRef
JOIN FIN3.SL sl ON sl.SLID = vi.SLRef
WHERE sl.IsTraceable = 1
  AND vi.DLLevel4 IS NULL
  AND (ISNULL(vi.Debit, 0) <> 0 OR ISNULL(vi.Credit, 0) <> 0)
ORDER BY (vi.Debit + vi.Credit) DESC`.trim(),
  },

  {
    id: "fin.sl.nature_violated",
    module: "FIN",
    pack: "health",
    severity: "high",
    titleFa: "مانده معین خلاف ماهیت حساب",
    descriptionFa:
      "معین‌هایی که ماهیت بدهکار/بستانکار دارند ولی مانده‌شان در جهت مخالف است.",
    whyItMattersFa:
      "مانده خلاف ماهیت تقریباً همیشه یعنی سند اشتباه ثبت شده یا تسویه دوباره خورده است. این‌ها همان جاهایی است که مبلغ گم می‌شود.",
    fixHintFa: "گردش معین را از تاریخ ماندهٔ منفی به بعد بررسی کنید.",
    sql: `
SELECT
  sl.SLID AS entity_id,
  CONCAT(N'معین ', sl.Code, N' - ', sl.Title) AS title,
  CONCAT(N'ماهیت حساب ', CASE sl.Nature WHEN 2 THEN N'بدهکار' ELSE N'بستانکار' END,
         N' است اما مانده ', FORMAT(SUM(vi.Debit) - SUM(vi.Credit), 'N0'), N' ریال می‌باشد') AS detail,
  SUM(vi.Debit) - SUM(vi.Credit) AS amount,
  CAST(NULL AS datetime) AS ref_date
FROM FIN3.SL sl
JOIN FIN3.VoucherItem vi ON vi.SLRef = sl.SLID
JOIN FIN3.Voucher v ON v.VoucherID = vi.VoucherRef
WHERE sl.Nature IN (2, 3)
  AND sl.State = 1
  AND v.State = 32
GROUP BY sl.SLID, sl.Code, sl.Title, sl.Nature
HAVING (sl.Nature = 2 AND SUM(vi.Debit) - SUM(vi.Credit) < 0)
    OR (sl.Nature = 3 AND SUM(vi.Debit) - SUM(vi.Credit) > 0)`.trim(),
  },

  {
    id: "fin.party.duplicate_national_id",
    module: "FIN",
    pack: "health",
    severity: "high",
    titleFa: "طرف‌حساب تکراری با کد ملی یکسان",
    descriptionFa: "چند طرف‌حساب مجزا که کد ملی یکسانی دارند.",
    whyItMattersFa:
      "میراث دورهٔ اکسل: یک شخص چند بار ثبت شده و مانده‌اش بین چند کد پخش است. مانده واقعی او هیچ‌جا کامل دیده نمی‌شود و پیگیری وصول ناممکن است.",
    fixHintFa: "طرف‌حساب‌ها را ادغام کنید و تفصیلی‌های تکراری را به یک کد نگاشت دهید.",
    sql: `
SELECT
  MIN(p.PartyID) AS entity_id,
  CONCAT(N'کد ملی/شناسه ', p.NationalID) AS title,
  CONCAT(N'این شناسه برای ', COUNT(*), N' طرف‌حساب مجزا ثبت شده است') AS detail,
  CAST(NULL AS decimal(18, 0)) AS amount,
  CAST(NULL AS datetime) AS ref_date
FROM GNR3.Party p
WHERE NULLIF(LTRIM(RTRIM(p.NationalID)), N'') IS NOT NULL
GROUP BY p.NationalID
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC`.trim(),
  },

  {
    id: "fin.party.duplicate_economic_code",
    module: "FIN",
    pack: "health",
    severity: "high",
    titleFa: "طرف‌حساب تکراری با کد اقتصادی یکسان",
    descriptionFa: "چند شرکت مجزا که کد اقتصادی یکسانی دارند.",
    whyItMattersFa:
      "علاوه بر پخش‌شدن مانده، کد اقتصادی تکراری در گزارش‌های مالیاتی (معاملات فصلی) رد می‌شود.",
    fixHintFa: "شرکت‌های تکراری را ادغام و کد اقتصادی صحیح را روی یک رکورد نگه دارید.",
    sql: `
SELECT
  MIN(p.PartyID) AS entity_id,
  CONCAT(N'کد اقتصادی ', p.EconomicCode) AS title,
  CONCAT(N'این کد برای ', COUNT(*), N' طرف‌حساب مجزا ثبت شده است') AS detail,
  CAST(NULL AS decimal(18, 0)) AS amount,
  CAST(NULL AS datetime) AS ref_date
FROM GNR3.Party p
WHERE NULLIF(LTRIM(RTRIM(p.EconomicCode)), N'') IS NOT NULL
GROUP BY p.EconomicCode
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC`.trim(),
  },

  {
    id: "fin.dl.inactive_with_balance",
    module: "FIN",
    pack: "health",
    severity: "medium",
    titleFa: "تفصیلی غیرفعال با مانده باز",
    descriptionFa: "تفصیلی‌هایی که غیرفعال شده‌اند ولی هنوز مانده دارند.",
    whyItMattersFa:
      "مانده‌ای که پشت یک تفصیلی غیرفعال مانده، در فهرست‌های جاری دیده نمی‌شود و عملاً از چشم مدیر مالی پنهان است.",
    fixHintFa: "تفصیلی را موقتاً فعال و مانده را تسویه یا منتقل کنید.",
    sql: `
SELECT
  dl.DLID AS entity_id,
  CONCAT(N'تفصیلی ', dl.Code, N' - ', dl.Title) AS title,
  CONCAT(N'غیرفعال است اما مانده باز دارد: ', FORMAT(SUM(vi.Debit) - SUM(vi.Credit), 'N0'), N' ریال') AS detail,
  SUM(vi.Debit) - SUM(vi.Credit) AS amount,
  CAST(NULL AS datetime) AS ref_date
FROM FIN3.DL dl
JOIN FIN3.VoucherItem vi
  ON vi.DLLevel4 = dl.Code
 AND vi.DLTypeRef4 = dl.DLTypeRef
WHERE dl.State = 0
GROUP BY dl.DLID, dl.Code, dl.Title
HAVING SUM(vi.Debit) - SUM(vi.Credit) <> 0`.trim(),
  },

  {
    id: "fin.voucher.stale_temporary",
    module: "FIN",
    pack: "health",
    severity: "medium",
    titleFa: "سند موقت قدیمی که قطعی نشده",
    descriptionFa: "اسنادی که بیش از حد مجاز در وضعیت موقت مانده‌اند.",
    whyItMattersFa:
      "سند موقت در بسیاری از گزارش‌ها لحاظ نمی‌شود. هرچه تعدادشان بیشتر باشد، فاصلهٔ بین «واقعیت شرکت» و «آنچه سیستم نشان می‌دهد» بیشتر است.",
    fixHintFa: "اسناد را بررسی و قطعی کنید، یا اگر بی‌اعتبارند حذفشان کنید.",
    params: [{ name: "maxAgeDays", labelFa: "حداکثر عمر مجاز (روز)", defaultValue: 30 }],
    sql: `
SELECT
  v.VoucherID AS entity_id,
  CONCAT(N'سند شماره ', v.Number, N' مورخ ', SYS3.fn_DateToShamsiDate(v.Date)) AS title,
  CONCAT(DATEDIFF(day, v.Date, GETDATE()), N' روز در وضعیت موقت مانده است') AS detail,
  (SELECT SUM(vi.Debit) FROM FIN3.VoucherItem vi WHERE vi.VoucherRef = v.VoucherID) AS amount,
  v.Date AS ref_date
FROM FIN3.Voucher v
WHERE v.State = 1
  AND v.Date < DATEADD(day, -{{maxAgeDays}}, GETDATE())
ORDER BY v.Date ASC`.trim(),
  },
];
