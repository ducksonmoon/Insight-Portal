-- LetterOfCredit Business Entity — the unfiltered full scan.
--
-- Layer 2 of docs/architecture/lc-monitoring.md: reuses the exact settlement
-- pipeline lc.sql and lc-summary.sql already share (see lc-core.sql), with
-- every report parameter pinned to NULL so it always returns the whole book
-- — the "full scan" the doc measured at ~10s / ~19s and called "comfortably
-- syncable on a schedule". One row per LC detail account, i.e. one row per
-- (شماره گشایش × شماره سفارش) in this customer's data — same grain as
-- lc-summary.sql. Column aliases here are the entity's public contract; see
-- src/lib/entities/definitions/lc.ts, whose field list must match.
--
-- Read-only: never used with report parameters, never executed with a
-- user-supplied filter. src/lib/entities/sync.ts runs this exactly as-is on
-- a schedule and materializes the result.

DECLARE @dl4 NVARCHAR(400) = NULL;
DECLARE @dl5 NVARCHAR(50)  = NULL;
DECLARE @OrderNumber NVARCHAR(100) = NULL;
DECLARE @STARTDATE DATE = NULL;
DECLARE @ENDDATE DATE = NULL;

-- @include lc-core.sql

DECLARE @AsOf DATE = CAST(GETDATE() AS DATE);
DECLARE @Tol  DECIMAL(38, 0) = 150000;   -- same rounding tolerance the settlement itself uses

;WITH LcRows AS (
    SELECT
        fc.DL4Code, fc.DL5Code, fc.DL6Code,
        fc.[4] AS PartyTitle, fc.[5] AS BankTitle,
        fc.ExtractedLCNumber, fc.ExtractedOrderNumber, fc.Term_Days_Final,
        fc.OpeningAmount, fc.OpeningDate,
        fc.DueDate,
        CreditAmount = CAST(fc.CreditAmount AS DECIMAL(38, 0)),
        MablaghJoz   = CAST(fc.MablaghJoz   AS DECIMAL(38, 0)),
        Paid         = CAST(rd.DisplayedDebit AS DECIMAL(38, 0)),
        -- Flip to "positive means we owe" — same convention lc-summary.sql uses.
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
        BankTitle   = LTRIM(RTRIM(REPLACE(MAX(BankTitle), N'-بانک گشایش کننده', N''))),
        TermDays    = MAX(Term_Days_Final),
        OpeningAmount = NULLIF(MAX(OpeningAmount), 0),
        OpeningDate   = MIN(OpeningDate),

        InvoiceCount  = COUNT(*),
        TotalInvoiced = SUM(CreditAmount),
        TotalNet      = SUM(MablaghJoz),
        TotalPaid     = SUM(Paid),
        Outstanding   = SUM(Outstanding),
        Surplus       = SUM(Surplus),

        NextOpenDue   = MIN(CASE WHEN Outstanding > 0 THEN DueDate END),
        OldestOpenDue = MIN(CASE WHEN Outstanding > 0 AND DueDate < @AsOf THEN DueDate END),
        OverdueAmount = SUM(CASE WHEN Outstanding > 0 AND DueDate < @AsOf THEN Outstanding ELSE 0 END),

        -- Same data-quality signal lc-summary.sql's هشدار column reports.
        DqNoLc     = MAX(CASE WHEN ExtractedLCNumber    IS NULL THEN 1 ELSE 0 END),
        DqNoOrder  = MAX(CASE WHEN ExtractedOrderNumber IS NULL THEN 1 ELSE 0 END),
        DqNoTerm   = MAX(CASE WHEN Term_Days_Final      IS NULL THEN 1 ELSE 0 END),
        DqNoOpen   = MAX(CASE WHEN OpeningAmount IS NULL OR OpeningAmount = 0 THEN 1 ELSE 0 END)
    FROM LcRows
    GROUP BY DL4Code, DL5Code, DL6Code
)
SELECT
    -- The detail-account code triple is the one thing guaranteed unique and
    -- non-null for every row (unlike the parsed LC/order numbers, which can
    -- both be missing on a malformed title — see lc-monitoring.md §2.5).
    CONCAT(a.DL4Code, N'::', a.DL5Code, N'::', a.DL6Code) AS externalId,
    a.OrderNumber                                         AS orderNumber,
    a.LcNumber                                             AS lcIdentifier,
    a.BankTitle                                            AS bankName,
    a.PartyTitle                                           AS counterpartName,
    a.OpeningAmount                                        AS openingAmount,
    a.OpeningDate                                          AS openingDate,
    a.TotalInvoiced                                        AS totalInvoiced,
    CASE WHEN a.OpeningAmount IS NOT NULL
         THEN CAST(a.TotalInvoiced * 100.0 / a.OpeningAmount AS DECIMAL(9, 1))
    END                                                     AS usagePct,
    a.TotalNet                                              AS netPayable,
    a.TotalPaid                                             AS totalPaid,
    a.Outstanding                                           AS remainingDebt,
    a.Surplus                                               AS surplusPayment,
    a.NextOpenDue                                           AS nextDueDate,
    -- Negative = overdue, same sign convention as Receivable.daysUntilDue
    -- and as lc-summary.sql's own DaysToDue. NULL when nothing is open.
    DATEDIFF(DAY, @AsOf, a.NextOpenDue)                     AS daysUntilDue,
    a.OverdueAmount                                         AS overdueAmount,
    CASE WHEN a.OldestOpenDue IS NOT NULL
         THEN DATEDIFF(DAY, a.OldestOpenDue, @AsOf)
    END                                                      AS overdueDays,
    a.TermDays                                              AS termDays,
    a.InvoiceCount                                          AS invoiceCount,
    CASE WHEN a.OpeningAmount IS NOT NULL
         THEN a.OpeningAmount - a.TotalInvoiced
    END                                                      AS unusedCredit,
    -- Kept apart on purpose, same reasoning as lc-summary.sql: a missing LC
    -- number/order number/term is a genuine parse failure, but most LCs in
    -- this data simply have no matching opening record on file at all
    -- (see lc-monitoring.md's Layer 1 finding — 47 of 137), which is a fact
    -- about the books, not a defect in the report.
    (a.DqNoLc + a.DqNoOrder + a.DqNoTerm)                   AS dqParseFlags,
    a.DqNoOpen                                              AS dqNoOpening
FROM Agg a;
