/**
 * LC (اعتبار اسنادی) data probe — read-only, never writes to Rahkaran.
 *
 *   npm run lc:probe
 *   npm run lc:probe -- --timing        # also time the shipped report query
 *   npm run lc:probe -- --json out.json
 *
 * Why this exists: docs/architecture/management-intelligence-platform.md §14
 * deferred modelling an `LC` Business Entity behind two questions it refused
 * to guess at — "is the unfiltered full-scan fast enough to sync
 * periodically?" and "is title-text parsing reliable enough to trust in an
 * automated rule?". This script answers both with measurements, and is the
 * gate on the plan in docs/architecture/lc-monitoring.md.
 *
 * It runs the *shipped* parser (src/lib/reports/sql/lc.sql) in SQL and a
 * *corrected* parser in TypeScript over the same detail-account titles, then
 * reports where the two disagree — so a disagreement count, not an argument,
 * decides whether the current numbers can be trusted.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NON_LATIN_DIGIT, parseLcTitle, ZERO_WIDTH_ANY } from "../src/lib/reports/lc-title";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const hasFlag = (name: string) => process.argv.includes(`--${name}`);
const fmt = new Intl.NumberFormat("fa-IR");

/**
 * src/lib/db/rahkaran.ts reads RAHKARAN_DB_* at module load, so the
 * environment has to exist before it is imported — hence loadEnvFiles() plus
 * a dynamic import inside main() rather than a top-level one. scan.ts gets
 * away with a plain import only because it also imports Prisma, which
 * dotenv-loads .env as a side effect; this script has no Prisma dependency.
 */
function loadEnvFiles(): void {
  for (const file of [".env.local", ".env"]) {
    const path = join(process.cwd(), file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      if (line.trimStart().startsWith("#")) continue;
      const match = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (!match) continue;
      const [, key, rawValue] = match;
      // First file wins, so .env.local overrides .env, and a real shell
      // variable overrides both.
      if (process.env[key] !== undefined) continue;
      process.env[key] = rawValue.trim().replace(/^["']|["']$/g, "");
    }
  }
}

/** SL (معین) codes this customer books LCs under — the same values src/lib/reports/sql/lc.sql hardcodes. */
const LC_SL_CODE = "3009";
const LC_OPENING_SL_CODE = "9301";

interface TitleRow extends Record<string, unknown> {
  DL6Code: string;
  DL6Title: string;
  TitleRows: number;
  /** What the shipped report extracts today — replicated expression-for-expression from lc.sql. */
  SqlOrderNumber: string | null;
  SqlLCNumber: string | null;
  SqlTermDays: number | null;
}

/**
 * The report's own parse, lifted verbatim from the prelude of
 * src/lib/reports/sql/lc.sql and applied to distinct detail-account titles
 * rather than to every voucher row. Kept identical to the report on purpose:
 * section 3 below compares it against src/lib/reports/lc-title.ts, so if one
 * side changes without the other, the disagreement count says so. That is the
 * whole point of this script — the two parsers are a contract, and this is
 * the test that they still hold on real data.
 */
const TITLE_QUERY = `
WITH T AS (
    SELECT
        dl6.Code  AS DL6Code,
        dl6.Title AS DL6Title,
        COUNT(*)  AS TitleRows
    FROM FIN3.VoucherItem vi
    INNER JOIN FIN3.Voucher vh ON vh.VoucherID = vi.VoucherRef
    INNER JOIN FIN3.DL dl6 ON dl6.Code = vi.DLLevel6 AND dl6.DLTypeRef = vi.DLTypeRef6
    WHERE vi.SLCode = N'${LC_SL_CODE}'
      AND vh.IsTemporary = 0
      AND vh.State <> 2
      AND vh.LedgerRef = 1
    GROUP BY dl6.Code, dl6.Title
),
N AS (
    SELECT T.*,
        TitleNorm =
        REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
        REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
        REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
        REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
        REPLACE(REPLACE(T.DL6Title,
            NCHAR(8204), N''), NCHAR(8206), N''), NCHAR(8207), N''),
            NCHAR(1564), N''), NCHAR(1600), N''), NCHAR(65279), N''),
            NCHAR(1776), N'0'), NCHAR(1777), N'1'), NCHAR(1778), N'2'), NCHAR(1779), N'3'),
            NCHAR(1780), N'4'), NCHAR(1781), N'5'), NCHAR(1782), N'6'), NCHAR(1783), N'7'),
            NCHAR(1784), N'8'), NCHAR(1785), N'9'),
            NCHAR(1632), N'0'), NCHAR(1633), N'1'), NCHAR(1634), N'2'), NCHAR(1635), N'3'),
            NCHAR(1636), N'4'), NCHAR(1637), N'5'), NCHAR(1638), N'6'), NCHAR(1639), N'7'),
            NCHAR(1640), N'8'), NCHAR(1641), N'9')
    FROM T
)
SELECT
    n.DL6Code,
    n.DL6Title,
    n.TitleRows,
    SqlOrderNumber = CASE
        WHEN pos.pOrder IS NOT NULL
         AND PATINDEX(N'%[' + NCHAR(1536) + N'-' + NCHAR(1791) + N']%',
                 LEFT(tail.OrderTail, pos.pOrder - 1) COLLATE Latin1_General_BIN2) = 0
        THEN NULLIF(LEFT(SUBSTRING(tail.OrderTail, pos.pOrder, 400),
                PATINDEX(N'%[^0-9A-Za-z]%',
                    SUBSTRING(tail.OrderTail, pos.pOrder, 400) + N' ' COLLATE Latin1_General_BIN2) - 1), N'')
    END,
    SqlLCNumber = CASE
        WHEN pos.Star1 IS NOT NULL AND pos2.Star2 IS NOT NULL
        THEN NULLIF(LTRIM(RTRIM(SUBSTRING(tail.LcTail, pos.Star1 + 1, pos2.Star2 - pos.Star1 - 1))), N'')
        WHEN pos.pLc IS NOT NULL
        THEN NULLIF(LEFT(SUBSTRING(tail.LcTail, pos.pLc, 400),
                PATINDEX(N'%[^0-9A-Za-z/]%',
                    SUBSTRING(tail.LcTail, pos.pLc, 400) + N' ' COLLATE Latin1_General_BIN2) - 1), N'')
    END,
    SqlTermDays = TRY_CAST(REVERSE(LEFT(SUBSTRING(tail.TermHead, pos.pTerm, 20),
        PATINDEX(N'%[^0-9]%',
            SUBSTRING(tail.TermHead, pos.pTerm, 20) + N' ' COLLATE Latin1_General_BIN2) - 1)) AS INT)
FROM N n
CROSS APPLY (VALUES (
    CASE WHEN CHARINDEX(N'سفارش', n.TitleNorm) > 0
         THEN SUBSTRING(n.TitleNorm, CHARINDEX(N'سفارش', n.TitleNorm) + 5, 400) END,
    CASE WHEN CHARINDEX(N'اعتبار', n.TitleNorm) > 0
         THEN SUBSTRING(n.TitleNorm, CHARINDEX(N'اعتبار', n.TitleNorm) + 6, 400) END,
    CASE WHEN CHARINDEX(N'روزه', n.TitleNorm) > 0
         THEN REVERSE(LEFT(n.TitleNorm, CHARINDEX(N'روزه', n.TitleNorm) - 1)) END
)) AS tail (OrderTail, LcTail, TermHead)
CROSS APPLY (VALUES (
    NULLIF(PATINDEX(N'%[0-9A-Za-z]%', tail.OrderTail COLLATE Latin1_General_BIN2), 0),
    NULLIF(PATINDEX(N'%[0-9]%',       tail.TermHead  COLLATE Latin1_General_BIN2), 0),
    NULLIF(PATINDEX(N'%[0-9A-Za-z]%', tail.LcTail    COLLATE Latin1_General_BIN2), 0),
    NULLIF(CHARINDEX(N'*', tail.LcTail), 0)
)) AS pos (pOrder, pTerm, pLc, Star1)
CROSS APPLY (VALUES (
    NULLIF(CHARINDEX(N'*', tail.LcTail, pos.Star1 + 1), 0)
)) AS pos2 (Star2)`;

/* ── the corrected parser ─────────────────────────────────────────────────
 * src/lib/reports/lc-title.ts is the reference implementation (and the thing
 * with unit tests). Importing it here rather than re-implementing means the
 * disagreement counts below always compare the shipped T-SQL against the
 * parser we actually intend to ship, not against a second opinion that can
 * drift from it.
 */

function pct(part: number, total: number): string {
  return total === 0 ? "—" : `${Math.round((part / total) * 100)}٪`;
}

const rule = (char = "─") => char.repeat(66);
const isoDay = (value: Date | string | null | undefined): string =>
  value ? new Date(value).toISOString().slice(0, 10) : "—";

async function main() {
  loadEnvFiles();
  const { queryRahkaran } = await import("../src/lib/db/rahkaran");

  const jsonPath = arg("json");
  const report: Record<string, unknown> = {};

  console.log("");
  console.log(rule("═"));
  console.log("  بررسی داده اعتبارات اسنادی (LC) — فقط خواندنی");
  console.log(rule("═"));

  /* 1 ── volume, and how much of it the DLTypeRef fix would exclude ─────── */
  const [volume] = await queryRahkaran<{
    Items: number;
    Dl6Codes: number;
    MissingDlType6: number;
    FirstDate: Date | null;
    LastDate: Date | null;
  }>(`
    SELECT
        COUNT(*)                    AS Items,
        COUNT(DISTINCT vi.DLLevel6) AS Dl6Codes,
        SUM(CASE WHEN vi.DLTypeRef6 IS NULL THEN 1 ELSE 0 END) AS MissingDlType6,
        MIN(vh.Date)                AS FirstDate,
        MAX(vh.Date)                AS LastDate
    FROM FIN3.VoucherItem vi
    INNER JOIN FIN3.Voucher vh ON vh.VoucherID = vi.VoucherRef
    WHERE vi.SLCode = N'${LC_SL_CODE}'
      AND vh.IsTemporary = 0 AND vh.State <> 2 AND vh.LedgerRef = 1`);

  console.log("");
  console.log("۱) حجم داده");
  console.log(`   سطر سند روی معین ${LC_SL_CODE} : ${fmt.format(volume?.Items ?? 0)}`);
  console.log(`   تفصیل سطح ۶ یکتا (هر LC) : ${fmt.format(volume?.Dl6Codes ?? 0)}`);
  console.log(`   بازه تاریخ : ${isoDay(volume?.FirstDate)} تا ${isoDay(volume?.LastDate)}`);
  console.log(`   سطر بدون DLTypeRef6 : ${fmt.format(volume?.MissingDlType6 ?? 0)}  (اگر صفر نباشد، JOIN با DLTypeRef این سطرها را حذف می‌کند)`);
  report.volume = volume;

  /* 2 ── parse reliability, shipped parser vs corrected ─────────────────── */
  const titles = await queryRahkaran<TitleRow>(TITLE_QUERY);
  const analysed = titles.map((row) => ({
    code: row.DL6Code,
    title: row.DL6Title,
    rows: Number(row.TitleRows),
    sql: {
      order: row.SqlOrderNumber?.trim() || null,
      lc: row.SqlLCNumber?.trim() || null,
      term: row.SqlTermDays ?? null,
    },
    corrected: parseLcTitle(row.DL6Title),
    hasNonLatinDigits: NON_LATIN_DIGIT.test(row.DL6Title),
    hasInvisibleChars: ZERO_WIDTH_ANY.test(row.DL6Title),
  }));

  const total = analysed.length;
  const count = (predicate: (t: (typeof analysed)[number]) => boolean) => analysed.filter(predicate);

  const missingOrder = count((t) => !t.corrected.orderNumber);
  const missingLc = count((t) => !t.corrected.lcIdentifier);
  const missingTerm = count((t) => t.corrected.termDays === null);
  const orderMismatch = count((t) => t.sql.order !== t.corrected.orderNumber);
  const lcMismatch = count((t) => t.sql.lc !== t.corrected.lcIdentifier);
  const termMismatch = count((t) => t.sql.term !== t.corrected.termDays);
  const nonLatin = count((t) => t.hasNonLatinDigits);
  const invisible = count((t) => t.hasInvisibleChars);

  console.log("");
  console.log("۲) قابلیت پارس عنوان تفصیل (روی عنوان‌های یکتا)");
  console.log(`   عنوان یکتا : ${fmt.format(total)}`);
  console.log(`   بدون شماره سفارش : ${fmt.format(missingOrder.length)} (${pct(missingOrder.length, total)})`);
  console.log(`   بدون شماره اعتبار : ${fmt.format(missingLc.length)} (${pct(missingLc.length, total)})`);
  console.log(`   بدون مهلت «روزه» : ${fmt.format(missingTerm.length)} (${pct(missingTerm.length, total)})`);
  console.log(`   دارای ارقام فارسی/عربی : ${fmt.format(nonLatin.length)}`);
  console.log(`   دارای کاراکتر نامرئی : ${fmt.format(invisible.length)}`);

  const disagreements = orderMismatch.length + lcMismatch.length + termMismatch.length;
  console.log("");
  console.log("۳) تطابق پارسر SQL گزارش با پارسر مرجع TypeScript");
  if (disagreements === 0) {
    console.log(`   هر ${fmt.format(total)} عنوان یکسان پارس شد — دو پارسر هم‌خوان‌اند.`);
  } else {
    console.log(`   شماره سفارش متفاوت : ${fmt.format(orderMismatch.length)} (${pct(orderMismatch.length, total)})`);
    console.log(`   شناسه اعتبار متفاوت : ${fmt.format(lcMismatch.length)} (${pct(lcMismatch.length, total)})`);
    console.log(`   مهلت متفاوت : ${fmt.format(termMismatch.length)} (${pct(termMismatch.length, total)})`);
    console.log(`   سطر سند متاثر : ${fmt.format(orderMismatch.reduce((sum, t) => sum + t.rows, 0))}`);
    console.log("   → یکی از دو طرف تغییر کرده و دیگری نه؛ هر دو باید اصلاح شوند.");
  }
  for (const sample of orderMismatch.slice(0, 5)) {
    console.log(`     · «${sample.title}»`);
    console.log(
      `       فعلی: ${sample.sql.order ?? "—"}   اصلاح‌شده: ${sample.corrected.orderNumber ?? "—"}   (${fmt.format(sample.rows)} سطر)`,
    );
  }
  report.titles = { total, rows: analysed };

  /* 3 ── LC-number collisions under the report's LIKE '%number%' match ──── */
  const lcNumbers = [
    ...new Set(analysed.flatMap((t) => t.corrected.lcSegments).filter((n): n is string => Boolean(n))),
  ];
  const collisions = lcNumbers.filter((a) => lcNumbers.some((b) => b !== a && b.includes(a)));

  console.log("");
  console.log("۴) خطر تطبیق گشایش با LIKE '%عدد%'");
  console.log(`   شماره اعتبار یکتا : ${fmt.format(lcNumbers.length)}`);
  console.log(`   شماره‌ای که زیررشتهٔ شماره دیگری است : ${fmt.format(collisions.length)}`);
  if (collisions.length > 0) {
    console.log(`     نمونه: ${collisions.slice(0, 8).join("، ")}`);
    console.log("     هر کدام می‌تواند مبلغ گشایش اعتبار دیگری را به خود بگیرد.");
  }
  report.lcNumberCollisions = collisions;

  /* 4 ── detail-account code reused across DL types (row multiplication) ── */
  const dupCodes = await queryRahkaran<{ Code: string; TypeCount: number; Titles: string }>(`
    SELECT
        dl.Code,
        COUNT(DISTINCT dl.DLTypeRef) AS TypeCount,
        STRING_AGG(CAST(dl.Title AS nvarchar(max)), N' | ') AS Titles
    FROM FIN3.DL dl
    WHERE dl.Code IN (
        SELECT vi.DLLevel6 FROM FIN3.VoucherItem vi WHERE vi.SLCode = N'${LC_SL_CODE}'
        UNION SELECT vi.DLLevel5 FROM FIN3.VoucherItem vi WHERE vi.SLCode = N'${LC_SL_CODE}'
        UNION SELECT vi.DLLevel4 FROM FIN3.VoucherItem vi WHERE vi.SLCode = N'${LC_SL_CODE}'
    )
    GROUP BY dl.Code
    HAVING COUNT(DISTINCT dl.DLTypeRef) > 1`);

  console.log("");
  console.log("۵) کد تفصیلی مشترک بین چند نوع تفصیل (خطر تکثیر ردیف)");
  console.log(`   کد مشترک : ${fmt.format(dupCodes.length)}`);
  for (const row of dupCodes.slice(0, 5)) {
    console.log(`     · ${row.Code} در ${row.TypeCount} نوع — ${row.Titles}`);
  }
  if (dupCodes.length > 0) {
    console.log("     گزارش فعلی فقط روی Code جوین می‌کند؛ افزودن DLTypeRef لازم است.");
  }
  report.duplicateDlCodes = dupCodes;

  /* 5 ── how many obligations are genuinely past due today ──────────────── */
  const [ageing] = await queryRahkaran<{
    TotalRows: number;
    PastDue: number;
    DueToday: number;
    DueNext7: number;
    DueNext30: number;
    NoTerm: number;
  }>(`
    WITH Base AS (
        SELECT
            DATEADD(DAY,
                ISNULL(CASE
                    WHEN dl6.Title LIKE N'%روزه%'
                        AND CHARINDEX(N'-', dl6.Title) > 0
                        AND CHARINDEX(N'-', dl6.Title) < CHARINDEX(N'روزه', dl6.Title)
                    THEN TRY_CAST(LTRIM(RTRIM(REPLACE(
                        SUBSTRING(dl6.Title,
                            CHARINDEX(N'-', dl6.Title) + 1,
                            CHARINDEX(N'روزه', dl6.Title) - CHARINDEX(N'-', dl6.Title) - 1),
                        N' ', N''))) AS INT)
                END, 0),
                vh.Date) AS DueDate,
            CASE
                WHEN dl6.Title LIKE N'%روزه%'
                    AND CHARINDEX(N'-', dl6.Title) > 0
                    AND CHARINDEX(N'-', dl6.Title) < CHARINDEX(N'روزه', dl6.Title)
                THEN 0 ELSE 1
            END AS NoTermFlag
        FROM FIN3.VoucherItem vi
        INNER JOIN FIN3.Voucher vh ON vh.VoucherID = vi.VoucherRef
        INNER JOIN FIN3.DL dl6 ON dl6.Code = vi.DLLevel6 AND dl6.DLTypeRef = vi.DLTypeRef6
        WHERE vi.SLCode = N'${LC_SL_CODE}'
          AND vh.IsTemporary = 0 AND vh.State <> 2 AND vh.LedgerRef = 1
          AND ISNULL(vi.Credit, 0) > 0
    )
    SELECT
        COUNT(*) AS TotalRows,
        SUM(CASE WHEN DueDate <  CAST(GETDATE() AS date) THEN 1 ELSE 0 END) AS PastDue,
        SUM(CASE WHEN DueDate =  CAST(GETDATE() AS date) THEN 1 ELSE 0 END) AS DueToday,
        SUM(CASE WHEN DueDate >  CAST(GETDATE() AS date)
                  AND DueDate <= DATEADD(DAY,  7, CAST(GETDATE() AS date)) THEN 1 ELSE 0 END) AS DueNext7,
        SUM(CASE WHEN DueDate >  CAST(GETDATE() AS date)
                  AND DueDate <= DATEADD(DAY, 30, CAST(GETDATE() AS date)) THEN 1 ELSE 0 END) AS DueNext30,
        SUM(NoTermFlag) AS NoTerm
    FROM Base`);

  console.log("");
  console.log("۶) توزیع سررسید فاکتورها نسبت به امروز (پیش از تسویه)");
  console.log(`   کل سطر بستانکار : ${fmt.format(ageing?.TotalRows ?? 0)}`);
  console.log(`   سررسید گذشته : ${fmt.format(ageing?.PastDue ?? 0)}`);
  console.log(`   سررسید امروز : ${fmt.format(ageing?.DueToday ?? 0)}`);
  console.log(`   ۷ روز آینده : ${fmt.format(ageing?.DueNext7 ?? 0)}`);
  console.log(`   ۳۰ روز آینده : ${fmt.format(ageing?.DueNext30 ?? 0)}`);
  console.log(`   بدون مهلت (سررسید = تاریخ سند) : ${fmt.format(ageing?.NoTerm ?? 0)}`);
  report.ageing = ageing;

  /* 6 ── opening (off-balance) coverage ─────────────────────────────────── */
  const [opening] = await queryRahkaran<{ Items: number; Dl6Codes: number }>(`
    SELECT COUNT(*) AS Items, COUNT(DISTINCT vi.DLLevel6) AS Dl6Codes
    FROM FIN3.VoucherItem vi
    INNER JOIN FIN3.Voucher vh ON vh.VoucherID = vi.VoucherRef
    WHERE vi.SLCode = N'${LC_OPENING_SL_CODE}'
      AND vi.AccountGroupRef = CONVERT(bigint, 9)
      AND vh.IsTemporary = 0 AND vh.State <> 2 AND vh.LedgerRef = 1`);

  console.log("");
  console.log(`۷) حساب انتظامی گشایش (معین ${LC_OPENING_SL_CODE})`);
  console.log(`   سطر : ${fmt.format(opening?.Items ?? 0)}   تفصیل سطح ۶ : ${fmt.format(opening?.Dl6Codes ?? 0)}`);
  report.opening = opening;

  /* 7 ── runtime of the shipped report, unfiltered ──────────────────────── */
  console.log("");
  if (hasFlag("timing")) {
    const body = readFileSync(join(process.cwd(), "src", "lib", "reports", "sql", "lc.sql"), "utf8");
    const declarations = `
DECLARE @dl4 nvarchar(500) = NULL,
        @dl5 nvarchar(500) = NULL,
        @OrderNumber nvarchar(500) = NULL,
        @STARTDATE datetime = NULL,
        @ENDDATE datetime = NULL,
        @DebtStatus nvarchar(500) = NULL;
`;
    console.log("۸) زمان اجرای گزارش فعلی بدون فیلتر");
    const startedAt = Date.now();
    const rows = await queryRahkaran(`${declarations}\n${body}`);
    const elapsedMs = Date.now() - startedAt;
    console.log(`   ${fmt.format(rows.length)} سطر در ${fmt.format(elapsedMs)} میلی‌ثانیه`);
    console.log(
      elapsedMs < 30_000
        ? "   → برای همگام‌سازی زمان‌بندی‌شده به‌عنوان Business Entity مناسب است."
        : "   → برای همگام‌سازی دوره‌ای سنگین است؛ اول کرسر را با نسخه مجموعه‌ای جایگزین کنید.",
    );
    report.timing = { rows: rows.length, elapsedMs };
  } else {
    console.log("۸) زمان اجرا: با --timing اندازه‌گیری می‌شود (گزارش کامل را یک بار اجرا می‌کند).");
  }

  console.log("");
  console.log(rule());
  console.log("  هیچ نوشتنی روی راهکاران انجام نشد.");
  console.log(rule());

  if (jsonPath) {
    writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
    console.log(`خروجی ماشین‌خوان: ${jsonPath}`);
  }
  console.log("");
}

main()
  .catch((error) => {
    console.error("خطا:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
