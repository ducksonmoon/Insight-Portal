-- LC detail accounts and their parsed titles — not a report itself.
--
-- Included by lc-core.sql (the settlement pipeline behind the detail and
-- summary reports) and directly by lc-payments.sql, which needs the parsed
-- شماره گشایش / شماره سفارش but none of the settlement work. Splitting it out
-- is what keeps the payments dataset at about a second instead of twenty.
--
-- Leaves behind:
--   #LcAccount  distinct (DL4, DL5, DL6, DLTypeRef6) an LC liability row uses
--   #LcTitle    per detail account: ExtractedOrderNumber, ExtractedLCNumber,
--               Term_Days_Final — parsed from the free-text title

/* == Prelude =============================================================
 * Everything that depends only on the detail accounts — the parsed titles and
 * the opening match — is computed here, once, into temp tables.
 *
 * Not a style preference. These are all CTEs in the report's natural shape,
 * and SQL Server inlines a CTE at every reference: hanging them off the row
 * pipeline below (six window functions over every LC voucher line) made the
 * optimizer re-evaluate that pipeline per reference, and took this query from
 * ten seconds to nearly seven minutes. #FinalCalc further down exists for the
 * same reason.
 * ======================================================================== */

IF OBJECT_ID('tempdb..#LcAccount') IS NOT NULL DROP TABLE #LcAccount;
IF OBJECT_ID('tempdb..#LcTitle')   IS NOT NULL DROP TABLE #LcTitle;
IF OBJECT_ID('tempdb..#LcOpening') IS NOT NULL DROP TABLE #LcOpening;

-- The detail-account combinations an LC liability row can carry.
SELECT DISTINCT
    vi.DLLevel4   AS DL4Code,
    vi.DLLevel5   AS DL5Code,
    vi.DLLevel6   AS DL6Code,
    vi.DLTypeRef6 AS DL6TypeRef
INTO #LcAccount
FROM fin3.VoucherItem vi
INNER JOIN fin3.Voucher vh ON vi.VoucherRef = vh.VoucherID
WHERE vi.SLCode = N'3009'
  AND vh.IsTemporary = 0
  AND vh.State <> 2
  AND vh.LedgerRef = 1;

CREATE CLUSTERED INDEX IX_LcAccount ON #LcAccount (DL6Code, DL6TypeRef, DL4Code, DL5Code);

;WITH
/* ── Title parsing ────────────────────────────────────────────────────────
 * Three facts that make an LC row mean anything — the order number, the LC
 * identifier and the usance term — exist only as free text in the level-6
 * detail account's title:
 *
 *   سفارش 04130282 ورق خودرو-60 روزه-ش اعتبار *1404281696948/5946904435134691* (اعتبار ملت)
 *
 * Each is read by anchoring on its keyword and taking the token that follows,
 * skipping punctuation but never a word. Character ranges are compared under
 * Latin1_General_BIN2 so `[0-9A-Za-z]` means exactly those characters,
 * whatever the database's own collation would otherwise do with Persian text.
 *
 * Parsed here once per detail account rather than per voucher row — 139 titles
 * back 2,304 rows — and deliberately outside the window-function pipeline
 * below, where re-deriving it per row cost this query 35 seconds.
 *
 * src/lib/reports/lc-title.ts is the TypeScript twin of this logic and the one
 * with unit tests; `npm run lc:probe` re-checks that the two still agree on
 * every real title. Change one, change the other.
 */
LcTitles AS (
    SELECT
        dl.Code,
        dl.DLTypeRef,
        -- Folded once: Persian/Arabic-Indic digits to ASCII, invisible bidi and
        -- ZWNJ marks dropped. No title needs this today (measured: zero), but
        -- without it such a title parses to NULL and the report turns that into
        -- a zero-day term — a due date equal to the invoice date, which reads
        -- as overdue on arrival, with no error anywhere.
        TitleNorm =
        REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
        REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
        REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
        REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
        REPLACE(REPLACE(dl.Title,
            NCHAR(8204), N''), NCHAR(8206), N''), NCHAR(8207), N''),
            NCHAR(1564), N''), NCHAR(1600), N''), NCHAR(65279), N''),
            NCHAR(1776), N'0'), NCHAR(1777), N'1'), NCHAR(1778), N'2'), NCHAR(1779), N'3'),
            NCHAR(1780), N'4'), NCHAR(1781), N'5'), NCHAR(1782), N'6'), NCHAR(1783), N'7'),
            NCHAR(1784), N'8'), NCHAR(1785), N'9'),
            NCHAR(1632), N'0'), NCHAR(1633), N'1'), NCHAR(1634), N'2'), NCHAR(1635), N'3'),
            NCHAR(1636), N'4'), NCHAR(1637), N'5'), NCHAR(1638), N'6'), NCHAR(1639), N'7'),
            NCHAR(1640), N'8'), NCHAR(1641), N'9')
    FROM (SELECT DISTINCT DL6Code, DL6TypeRef FROM #LcAccount) k
    INNER JOIN fin3.DL dl
        ON dl.Code = k.DL6Code AND dl.DLTypeRef = k.DL6TypeRef
),

LcTitleParse AS (
    SELECT
        t.Code,
        t.DLTypeRef,
        -- A word between the keyword and the number means the order number was
        -- never typed — two real titles read «سفارش  فولاد زرین-60 روزه», where
        -- the next number is the usance term. Adopting it would pool unrelated
        -- vouchers under a fictitious order «60» and, at two characters, match
        -- a dozen unrelated openings through the LIKE below. NULL is the
        -- truthful answer, and the report's own DQ columns surface it.
        ExtractedOrderNumber = CASE
            WHEN pos.pOrder IS NOT NULL
             AND PATINDEX(N'%[' + NCHAR(1536) + N'-' + NCHAR(1791) + N']%',
                     LEFT(tail.OrderTail, pos.pOrder - 1) COLLATE Latin1_General_BIN2) = 0
            THEN NULLIF(LEFT(SUBSTRING(tail.OrderTail, pos.pOrder, 400),
                    PATINDEX(N'%[^0-9A-Za-z]%',
                        SUBSTRING(tail.OrderTail, pos.pOrder, 400) + N' ' COLLATE Latin1_General_BIN2) - 1), N'')
        END,
        -- The whole «*…*» block, not one number: real titles carry two — and
        -- once four — slash-separated identifiers (a bank reference and an
        -- internal one, sometimes ILC-prefixed). Which of them is "the" LC
        -- number is a question for the finance team, not for this query.
        ExtractedLCNumber = CASE
            WHEN pos.Star1 IS NOT NULL AND pos2.Star2 IS NOT NULL
            THEN NULLIF(LTRIM(RTRIM(SUBSTRING(tail.LcTail, pos.Star1 + 1, pos2.Star2 - pos.Star1 - 1))), N'')
            WHEN pos.pLc IS NOT NULL
            THEN NULLIF(LEFT(SUBSTRING(tail.LcTail, pos.pLc, 400),
                    PATINDEX(N'%[^0-9A-Za-z/]%',
                        SUBSTRING(tail.LcTail, pos.pLc, 400) + N' ' COLLATE Latin1_General_BIN2) - 1), N'')
        END,
        Term_Days_Final = TRY_CAST(REVERSE(LEFT(SUBSTRING(tail.TermHead, pos.pTerm, 20),
            PATINDEX(N'%[^0-9]%',
                SUBSTRING(tail.TermHead, pos.pTerm, 20) + N' ' COLLATE Latin1_General_BIN2) - 1)) AS INT)
    FROM LcTitles t
    CROSS APPLY (VALUES (
        -- N'سفارش' is 5 characters and N'اعتبار' is 6. The previous version of
        -- this report advanced a fixed 7 past both, which is why 134 of 139
        -- order numbers arrived missing their first character.
        CASE WHEN CHARINDEX(N'سفارش', t.TitleNorm) > 0
             THEN SUBSTRING(t.TitleNorm, CHARINDEX(N'سفارش', t.TitleNorm) + 5, 400) END,
        CASE WHEN CHARINDEX(N'اعتبار', t.TitleNorm) > 0
             THEN SUBSTRING(t.TitleNorm, CHARINDEX(N'اعتبار', t.TitleNorm) + 6, 400) END,
        -- Reversed, so "the number beside روزه" is a prefix search instead of
        -- "everything after the first hyphen" — which the supplier's own name
        -- («فولاد تاراز-60 روزه») silently hijacked.
        CASE WHEN CHARINDEX(N'روزه', t.TitleNorm) > 0
             THEN REVERSE(LEFT(t.TitleNorm, CHARINDEX(N'روزه', t.TitleNorm) - 1)) END
    )) AS tail (OrderTail, LcTail, TermHead)
    CROSS APPLY (VALUES (
        NULLIF(PATINDEX(N'%[0-9A-Za-z]%', tail.OrderTail COLLATE Latin1_General_BIN2), 0),
        NULLIF(PATINDEX(N'%[0-9]%',       tail.TermHead  COLLATE Latin1_General_BIN2), 0),
        NULLIF(PATINDEX(N'%[0-9A-Za-z]%', tail.LcTail    COLLATE Latin1_General_BIN2), 0),
        NULLIF(CHARINDEX(N'*', tail.LcTail), 0)
    )) AS pos (pOrder, pTerm, pLc, Star1)
    CROSS APPLY (VALUES (
        NULLIF(CHARINDEX(N'*', tail.LcTail, pos.Star1 + 1), 0)
    )) AS pos2 (Star2)
)

SELECT Code, DLTypeRef, ExtractedOrderNumber, ExtractedLCNumber, Term_Days_Final
INTO #LcTitle
FROM LcTitleParse;

CREATE CLUSTERED INDEX IX_LcTitle ON #LcTitle (Code, DLTypeRef);


