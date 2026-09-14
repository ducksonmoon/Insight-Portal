-- گزارش اعتبارات اسنادی (ال سی) — سطح اعتبار، یک سطر به ازای هر گشایش × سفارش
--
-- The detail report (lc.sql) lists all 1,279 invoice lines. This one answers
-- the question the finance team actually reviews by — "how does this credit
-- stand today" — at the grain they review at: the LC detail account, which in
-- this customer's data is exactly 1:1 with (شماره گشایش × شماره سفارش). 137
-- rows instead of 1,279.
--
-- Three conventions differ from the detail report, on purpose:
--
--   * Money is returned as numbers, not FORMAT(...) strings. The grid then
--     sorts, filters, totals and exports it as money instead of as text —
--     sorting "9,000" above "80,000" was a real defect of the detail report.
--   * مانده بدهی is positive when money is owed. The pipeline's RemainingDebt
--     is pool − payable, so it is *negative* when the company still owes; that
--     reads backwards in a management view and is flipped here.
--   * Status is decided against today's date, not just against whether the
--     balance is zero. The six states are ordered by urgency, so sorting by
--     وضعیت sorts by what needs attention first.
--
-- Parameters: @dl4 @dl5 @OrderNumber @STARTDATE @ENDDATE @DebtStatus
--             @HorizonDays (how many days ahead «نزدیک سررسید» looks; default 7)

-- @include lc-core.sql

DECLARE @AsOf DATE = CAST(GETDATE() AS DATE);
DECLARE @Tol  DECIMAL(38, 0) = 150000;   -- the rounding tolerance the settlement already uses
DECLARE @Soon INT = ISNULL(NULLIF(@HorizonDays, 0), 7);

;WITH LcRows AS (
    SELECT
        fc.DL4Code, fc.DL5Code, fc.DL6Code,
        fc.[4] AS PartyTitle, fc.[5] AS BankTitle, fc.[6] AS LcTitle,
        fc.ExtractedLCNumber, fc.ExtractedOrderNumber, fc.Term_Days_Final,
        fc.OpeningAmount, fc.OpeningDate,
        fc.InvoiceDate, fc.DueDate, fc.DateSource,
        -- Rounded to whole rials. The 5% pre/mid-receipt arithmetic is float,
        -- and unrounded it surfaces as «34008160571.000004» in the grid.
        CreditAmount = CAST(fc.CreditAmount AS DECIMAL(38, 0)),
        MablaghJoz   = CAST(fc.MablaghJoz   AS DECIMAL(38, 0)),
        PreMid       = CAST(fc.MianDaryaft + fc.PishDaryaft AS DECIMAL(38, 0)),
        Paid         = CAST(rd.DisplayedDebit AS DECIMAL(38, 0)),
        -- Flip to "positive means we owe".
        Outstanding  = CAST(CASE WHEN rd.RemainingDebt < -@Tol THEN -rd.RemainingDebt ELSE 0 END AS DECIMAL(38, 0)),
        Surplus      = CAST(CASE WHEN rd.RemainingDebt >  @Tol THEN  rd.RemainingDebt ELSE 0 END AS DECIMAL(38, 0))
    FROM #FinalCalc fc
    INNER JOIN @RowDebt rd ON rd.CreditItemID = fc.CreditItemID
    WHERE rd.IsInDisplayRange = 1
),
-- How many distinct banks each detail account (DL6) is booked under. Should
-- always be 1 — a single LC has a single issuing bank — so a value over 1
-- means the same free-text title was typed under two different DL5 (bank)
-- codes, almost certainly a data-entry slip rather than two real credits.
-- Confirmed on this customer's data: detail account 85158 (سفارش 031060364)
-- carries 3,620,681,392 rial booked identically under both بانک صادرات and
-- بانک شهر — the same money, or a real duplicate booking, showing up as two
-- separate rows in this report with no indication anything was wrong.
Dl6BankCounts AS (
    SELECT DL6Code, BankCount = COUNT(DISTINCT DL5Code)
    FROM #LcAccount
    GROUP BY DL6Code
),
Agg AS (
    SELECT
        DL4Code, DL5Code, DL6Code,
        LcNumber    = MAX(ExtractedLCNumber),
        OrderNumber = MAX(ExtractedOrderNumber),
        PartyTitle  = MAX(PartyTitle),
        -- Every bank title carries the same "-بانک گشایش کننده" suffix; it is
        -- noise in a column whose header already says بانک عامل.
        BankTitle   = LTRIM(RTRIM(REPLACE(MAX(BankTitle), N'-بانک گشایش کننده', N''))),
        LcTitle     = MAX(LcTitle),
        TermDays    = MAX(Term_Days_Final),
        -- The pipeline stores an unmatched opening as 0; blank is the honest
        -- display, and it keeps 0 out of the usage-percentage denominator.
        OpeningAmount = NULLIF(MAX(OpeningAmount), 0),
        OpeningDate   = MIN(OpeningDate),

        InvoiceCount  = COUNT(*),
        TotalInvoiced = SUM(CreditAmount),
        TotalPreMid   = SUM(PreMid),
        TotalNet      = SUM(MablaghJoz),
        TotalPaid     = SUM(Paid),
        Outstanding   = SUM(Outstanding),
        Surplus       = SUM(Surplus),

        FirstInvoice  = MIN(InvoiceDate),
        LastInvoice   = MAX(InvoiceDate),
        NextOpenDue   = MIN(CASE WHEN Outstanding > 0 THEN DueDate END),
        OldestOpenDue = MIN(CASE WHEN Outstanding > 0 AND DueDate < @AsOf THEN DueDate END),

        OverdueAmount  = SUM(CASE WHEN Outstanding > 0 AND DueDate <  @AsOf THEN Outstanding ELSE 0 END),
        DueTodayAmount = SUM(CASE WHEN Outstanding > 0 AND DueDate =  @AsOf THEN Outstanding ELSE 0 END),
        DueSoonAmount  = SUM(CASE WHEN Outstanding > 0 AND DueDate >  @AsOf
                                   AND DueDate <= DATEADD(DAY, @Soon, @AsOf) THEN Outstanding ELSE 0 END),
        Due30Amount    = SUM(CASE WHEN Outstanding > 0 AND DueDate >  @AsOf
                                   AND DueDate <= DATEADD(DAY, 30, @AsOf) THEN Outstanding ELSE 0 END),

        Age1 = SUM(CASE WHEN Outstanding > 0 AND DATEDIFF(DAY, DueDate, @AsOf) BETWEEN  1 AND 30 THEN Outstanding ELSE 0 END),
        Age2 = SUM(CASE WHEN Outstanding > 0 AND DATEDIFF(DAY, DueDate, @AsOf) BETWEEN 31 AND 60 THEN Outstanding ELSE 0 END),
        Age3 = SUM(CASE WHEN Outstanding > 0 AND DATEDIFF(DAY, DueDate, @AsOf) BETWEEN 61 AND 90 THEN Outstanding ELSE 0 END),
        Age4 = SUM(CASE WHEN Outstanding > 0 AND DATEDIFF(DAY, DueDate, @AsOf) > 90             THEN Outstanding ELSE 0 END),

        -- What the free-text title failed to give us. A report built on text a
        -- person typed into an accounting field has to say how much of it
        -- parsed, or its silence gets read as confidence.
        DqNoLc     = MAX(CASE WHEN ExtractedLCNumber    IS NULL THEN 1 ELSE 0 END),
        DqNoOrder  = MAX(CASE WHEN ExtractedOrderNumber IS NULL THEN 1 ELSE 0 END),
        DqNoTerm   = MAX(CASE WHEN Term_Days_Final      IS NULL THEN 1 ELSE 0 END),
        DqNoOpen   = MAX(CASE WHEN OpeningAmount IS NULL OR OpeningAmount = 0 THEN 1 ELSE 0 END),
        DqFallback = SUM(CASE WHEN DateSource = N'Fallback-تاریخ سند' THEN 1 ELSE 0 END)
    FROM LcRows
    GROUP BY DL4Code, DL5Code, DL6Code
),
Scored AS (
    SELECT a.*,
        BankCount    = ISNULL(bc.BankCount, 1),
        UnusedCredit = CASE WHEN a.OpeningAmount IS NOT NULL
                            THEN a.OpeningAmount - a.TotalInvoiced END,
        UsagePct     = CASE WHEN a.OpeningAmount IS NOT NULL
                            THEN CAST(a.TotalInvoiced * 100.0 / a.OpeningAmount AS DECIMAL(9, 1)) END,
        DaysToDue    = DATEDIFF(DAY, @AsOf, a.NextOpenDue),
        OverdueDays  = CASE WHEN a.OldestOpenDue IS NOT NULL
                            THEN DATEDIFF(DAY, a.OldestOpenDue, @AsOf) END,
        -- Several different kinds of "don't fully trust this row", kept
        -- apart on purpose instead of one opaque count — a manager reading
        -- "3 ایراد" learns nothing about what's actually wrong or whether
        -- it's worth acting on. See the "ایراد داده"/"هشدار" comment below
        -- for how these become named, tooltipped badges.
        --   DqIdentifierCount — a genuine defect: the LC number, order
        --     number or usance term couldn't be read off the free-text
        --     title at all.
        --   DqDateFallback — a much milder issue: the voucher's own
        --     description carried no 14xx/xx/xx date, so the voucher's
        --     posting date stood in for the invoice date. Common, and often
        --     harmless, but worth knowing which rows it happened on.
        --   DqMultiBank — a genuine defect that can silently double-count
        --     debt: this DL6 is booked under more than one issuing bank
        --     (see Dl6BankCounts above).
        --   DqNoOpen (below, from Agg) — not a defect at all for most LCs
        --     in this data; see its own comment.
        DqIdentifierCount = a.DqNoLc + a.DqNoOrder + a.DqNoTerm,
        DqDateFallback    = CASE WHEN a.DqFallback > 0 THEN 1 ELSE 0 END,
        DqMultiBank       = CASE WHEN ISNULL(bc.BankCount, 1) > 1 THEN 1 ELSE 0 END,
        -- Total across every kind above, DqNoOpen included — a single
        -- numeric handle for "show me every row with 2+ issues" without
        -- parsing the pipe-delimited badge text back apart. The badges
        -- themselves (below) are what a reader actually reads.
        DqTotalCount = a.DqNoLc + a.DqNoOrder + a.DqNoTerm + a.DqNoOpen
                       + CASE WHEN a.DqFallback > 0 THEN 1 ELSE 0 END
                       + CASE WHEN ISNULL(bc.BankCount, 1) > 1 THEN 1 ELSE 0 END,
        -- Ordered by urgency, so sorting on وضعیت sorts by what to deal with
        -- first. «معوق» here means the due date has actually passed — the
        -- detail report calls any unsettled balance معوق, which is what made
        -- it report 859 overdue rows where 135 are genuinely overdue.
        StatusRank   = CASE
            WHEN a.OverdueAmount  > @Tol THEN 1
            WHEN a.DueTodayAmount > @Tol THEN 2
            WHEN a.DueSoonAmount  > @Tol THEN 3
            WHEN a.Outstanding    > @Tol THEN 4
            WHEN a.Surplus        > @Tol THEN 5
            ELSE 6 END
    FROM Agg a
    LEFT JOIN Dl6BankCounts bc ON bc.DL6Code = a.DL6Code
),
/*
 * Two different kinds of "something to look at", kept in two separate
 * columns rather than one merged «هشدار» string, because they are two
 * different questions and a reader needs to tell them apart at a glance:
 *
 *   ایراد داده     — the report is not fully sure of this row. Something the
 *                     title parser needed was missing or ambiguous, so a
 *                     number here (سررسید, مانده, درصد مصرف) may be off.
 *                     Read the row with that in mind; do not act on it blind.
 *   هشدار          — the row parsed fine and the numbers say something a
 *                     finance manager should act on (currently: usage past
 *                     the credit's own opening amount).
 *
 * Each is a "|"-joined list of short Persian phrases, not a count — see the
 * report definition's `badges` map for how the grid colors and explains each
 * one. STUFF(...,1,1,'') drops the leading separator.
 */
Final AS (
    SELECT s.*,
        LcStatus = CASE s.StatusRank
            WHEN 1 THEN N'معوق'
            WHEN 2 THEN N'سررسید امروز'
            WHEN 3 THEN N'نزدیک سررسید'
            WHEN 4 THEN N'جاری'
            WHEN 5 THEN N'مازاد پرداخت'
            ELSE N'تسویه شده' END,
        -- Named, pipe-delimited phrases instead of a bare count — "2 ایراد"
        -- tells a reader nothing; these render as colored, tooltipped badge
        -- chips via ReportColumn.badges (see LC_DATA_ISSUE_BADGES /
        -- LC_BUSINESS_ALERT_BADGES in src/lib/reports/definitions.ts).
        DataIssues = NULLIF(STUFF(
              CASE WHEN s.DqNoOrder = 1 THEN N'|بدون شماره سفارش' ELSE N'' END
            + CASE WHEN s.DqNoLc    = 1 THEN N'|بدون شناسه اعتبار' ELSE N'' END
            + CASE WHEN s.DqNoTerm  = 1 THEN N'|بدون مهلت پرداخت' ELSE N'' END
            + CASE WHEN s.DqNoOpen  = 1 THEN N'|بدون مبلغ گشایش' ELSE N'' END
            + CASE WHEN s.DqDateFallback = 1 THEN N'|تاریخ تخمینی' ELSE N'' END
            + CASE WHEN s.DqMultiBank    = 1 THEN N'|ثبت زیر چند بانک' ELSE N'' END
        , 1, 1, N''), N''),
        BusinessAlerts = NULLIF(STUFF(
              CASE WHEN s.OpeningAmount IS NOT NULL
                    AND s.TotalInvoiced > s.OpeningAmount + @Tol
                   THEN N'|مصرف بیش از گشایش' ELSE N'' END
        , 1, 1, N''), N'')
    FROM Scored s
)
SELECT
    ROW_NUMBER() OVER (ORDER BY f.StatusRank, f.NextOpenDue, f.OverdueDays DESC) AS [ردیف],
    f.LcStatus                                AS [وضعیت],
    -- Hidden by default: lets a user re-sort by urgency after sorting on
    -- something else, which sorting the Persian label alphabetically cannot do.
    f.StatusRank                              AS [اولویت وضعیت],
    f.DataIssues                              AS [ایراد داده],
    f.BusinessAlerts                          AS [هشدار],
    -- Hidden: a numeric handle on «ایراد داده» for sorting/filtering
    -- ("show me every row with 2 or more issues") without parsing the
    -- pipe-delimited text back apart.
    f.DqTotalCount                            AS [تعداد ایراد داده],
    f.LcNumber                                AS [شماره گشایش],
    f.OrderNumber                             AS [شماره سفارش],
    f.BankTitle                               AS [بانک عامل],
    f.PartyTitle                              AS [ذی‌نفع],
    f.TermDays                                AS [مهلت (روز)],
    SYS3.fn_DateToShamsiDate(f.OpeningDate)   AS [تاریخ گشایش],
    f.OpeningAmount                           AS [مبلغ گشایش],
    f.TotalInvoiced                           AS [جمع اسناد واصله],
    f.UsagePct                                AS [درصد مصرف اعتبار],
    f.UnusedCredit                            AS [مانده اعتبار استفاده‌نشده],
    f.InvoiceCount                            AS [تعداد فاکتور],
    f.TotalPreMid                             AS [پیش/میان دریافت],
    f.TotalNet                                AS [خالص قابل پرداخت],
    f.TotalPaid                               AS [پرداخت‌شده],
    f.Outstanding                             AS [مانده بدهی],
    f.Surplus                                 AS [مازاد پرداخت],
    SYS3.fn_DateToShamsiDate(f.NextOpenDue)   AS [نزدیک‌ترین سررسید باز],
    f.DaysToDue                               AS [روز تا سررسید],
    f.OverdueAmount                           AS [مبلغ معوق],
    f.OverdueDays                             AS [قدمت معوق (روز)],
    f.DueTodayAmount                          AS [سررسید امروز],
    f.DueSoonAmount                           AS [سررسید نزدیک],
    f.Due30Amount                             AS [سررسید ۳۰ روز],
    f.Age1                                    AS [معوق ۱-۳۰],
    f.Age2                                    AS [معوق ۳۱-۶۰],
    f.Age3                                    AS [معوق ۶۱-۹۰],
    f.Age4                                    AS [معوق بالای ۹۰],
    SYS3.fn_DateToShamsiDate(f.FirstInvoice)  AS [اولین فاکتور],
    SYS3.fn_DateToShamsiDate(f.LastInvoice)   AS [آخرین فاکتور],
    -- Hidden numeric flags behind the ایراد داده/هشدار badge columns above
    -- (see LC_SUMMARY_KPI_BAND in src/lib/reports/definitions.ts, which
    -- aggregates these directly rather than parsing the pipe-delimited
    -- badge text back apart). The narrower per-field booleans (which single
    -- identifier failed) live in ایراد داده itself, named and tooltipped —
    -- no separate hidden column needed for those.
    f.DqIdentifierCount                       AS [شناسه یا مهلت غیرقابل استخراج],
    f.DqDateFallback                          AS [تاریخ از شرح استخراج نشد],
    f.DqNoOpen                                AS [بدون گشایش شناسایی‌شده],
    f.DqMultiBank                             AS [ثبت زیر چند بانک],
    f.LcTitle                                 AS [شرح تفصیل اعتبار]
FROM Final f
WHERE (
    @DebtStatus IS NULL
    OR LTRIM(RTRIM(@DebtStatus)) = N''
    OR f.LcStatus = LTRIM(RTRIM(@DebtStatus))
)
ORDER BY f.StatusRank, f.NextOpenDue, f.OverdueDays DESC;
