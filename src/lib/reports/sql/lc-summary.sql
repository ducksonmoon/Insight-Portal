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
        UnusedCredit = CASE WHEN a.OpeningAmount IS NOT NULL
                            THEN a.OpeningAmount - a.TotalInvoiced END,
        UsagePct     = CASE WHEN a.OpeningAmount IS NOT NULL
                            THEN CAST(a.TotalInvoiced * 100.0 / a.OpeningAmount AS DECIMAL(9, 1)) END,
        DaysToDue    = DATEDIFF(DAY, @AsOf, a.NextOpenDue),
        OverdueDays  = CASE WHEN a.OldestOpenDue IS NOT NULL
                            THEN DATEDIFF(DAY, a.OldestOpenDue, @AsOf) END,
        -- Three different kinds of "don't fully trust this row", kept apart
        -- on purpose instead of one opaque count — a manager reading "3
        -- ایراد" learns nothing about what's actually wrong or whether it's
        -- worth acting on:
        --   DqIdentifierCount — a genuine defect: the LC number, order
        --     number or usance term couldn't be read off the free-text
        --     title at all.
        --   DqDateFallback — a much milder issue: the voucher's own
        --     description carried no 14xx/xx/xx date, so the voucher's
        --     posting date stood in for the invoice date. Common, and often
        --     harmless, but worth knowing which rows it happened on.
        --   DqNoOpen (below) — not a defect at all for most LCs in this
        --     data; see its own comment.
        DqIdentifierCount = a.DqNoLc + a.DqNoOrder + a.DqNoTerm,
        DqDateFallback    = CASE WHEN a.DqFallback > 0 THEN 1 ELSE 0 END,
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
),
Final AS (
    SELECT s.*,
        LcStatus = CASE s.StatusRank
            WHEN 1 THEN N'معوق'
            WHEN 2 THEN N'سررسید امروز'
            WHEN 3 THEN N'نزدیک سررسید'
            WHEN 4 THEN N'جاری'
            WHEN 5 THEN N'مازاد پرداخت'
            ELSE N'تسویه شده' END,
        -- Names the exact field(s) at fault instead of a bare count — "2
        -- ایراد در استخراج متن" tells a reader nothing; "شماره سفارش نامشخص
        -- + مهلت نامشخص" tells them exactly what to go check in راهکاران.
        Alert = STUFF(
            CASE WHEN s.OpeningAmount IS NOT NULL AND s.TotalInvoiced > s.OpeningAmount + @Tol
                 THEN N' + مصرف بیش از مبلغ گشایش' ELSE N'' END
          + CASE WHEN s.DqNoLc = 1 THEN N' + شماره اعتبار نامشخص' ELSE N'' END
          + CASE WHEN s.DqNoOrder = 1 THEN N' + شماره سفارش نامشخص' ELSE N'' END
          + CASE WHEN s.DqNoTerm = 1 THEN N' + مهلت نامشخص' ELSE N'' END
          + CASE WHEN s.DqDateFallback = 1
                 THEN N' + تاریخ فاکتور از شرح استخراج نشد (از تاریخ سند استفاده شد)' ELSE N'' END
          + CASE WHEN s.DqNoOpen = 1
                 THEN N' + بدون گشایش شناسایی‌شده' ELSE N'' END,
            1, 3, N'')
    FROM Scored s
)
SELECT
    ROW_NUMBER() OVER (ORDER BY f.StatusRank, f.NextOpenDue, f.OverdueDays DESC) AS [ردیف],
    f.LcStatus                                AS [وضعیت],
    -- Hidden by default: lets a user re-sort by urgency after sorting on
    -- something else, which sorting the Persian label alphabetically cannot do.
    f.StatusRank                              AS [اولویت وضعیت],
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
    NULLIF(f.Alert, N'')                      AS [هشدار],
    -- Split out of هشدار so the KPI band and any rule can count each kind
    -- separately instead of one opaque figure. The three summary columns
    -- drive the KPI cards; the three per-field ones are for drilling into
    -- exactly which field failed on a given row (visible in the column
    -- panel / Excel export, hidden from the default grid).
    f.DqIdentifierCount                       AS [شناسه یا مهلت غیرقابل استخراج],
    f.DqDateFallback                          AS [تاریخ از شرح استخراج نشد],
    f.DqNoOpen                                AS [بدون گشایش شناسایی‌شده],
    f.DqNoLc                                  AS [شماره اعتبار نامشخص],
    f.DqNoOrder                               AS [شماره سفارش نامشخص],
    f.DqNoTerm                                AS [مهلت نامشخص],
    f.LcTitle                                 AS [شرح تفصیل اعتبار]
FROM Final f
WHERE (
    @DebtStatus IS NULL
    OR LTRIM(RTRIM(@DebtStatus)) = N''
    OR f.LcStatus = LTRIM(RTRIM(@DebtStatus))
)
ORDER BY f.StatusRank, f.NextOpenDue, f.OverdueDays DESC;
