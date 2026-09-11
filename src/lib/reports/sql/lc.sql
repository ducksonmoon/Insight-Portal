-- گزارش اعتبارات اسنادی (ال سی) — ریز اقلام، یک سطر به ازای هر فاکتور
-- Parameters are bound by the app: @dl4, @dl5, @OrderNumber, @STARTDATE, @ENDDATE, @DebtStatus
--
-- Synced with شرکت فولاد بهمن's current RDL and corrected against their live
-- data. docs/architecture/lc-monitoring.md records the measurement behind each
-- change; `npm run lc:probe` reproduces them.
--
--   * Order-level FIFO settlement always runs. The previous version ran it only
--     when @OrderNumber was supplied and otherwise compared each row's own
--     debit to its own payable, which is not settlement. On this customer's
--     books that reported 859 rows معوق and 43 تسویه شده where the settled
--     calculation says 135 and 1,078.
--   * Settlement is computed over each in-scope order's full invoice history
--     and only then filtered for display (IsInDisplayRange). Filtering first,
--     as the previous version did, truncated the FIFO pool so a date window
--     changed balances that had nothing to do with the window.
--   * Titles are parsed by anchoring on their keywords instead of fixed +7
--     offsets. This restores the first character of 134 of 139 order numbers —
--     searching for the real «04130282» returned nothing before — and fills the
--     شماره اعتبار column, previously empty on every row.
--   * Opening records are matched on the LC identifier, which is what the
--     opening accounts are actually named after. The old empty-string parse
--     made that match `LIKE N'%%'`, so 1,098 rows showed the largest opening
--     belonging to the same supplier rather than their own.
--   * DL joins carry DLTypeRef, so a detail code shared between two detail
--     types cannot multiply rows, and Persian/Arabic digits and invisible bidi
--     marks are folded before parsing. Neither occurs in this data today; both
--     are silent-wrong-answer failures if they ever do.
--
-- Deliberately unchanged, because they are business rules for this customer to
-- confirm rather than defects to fix: the 5% pre-receipt and mid-receipt rates
-- (the دستورالعمل sets a 10% minimum), the Mellat exception keyed on the bank
-- title containing «ملت», and the 150,000-rial settlement tolerance.
--
-- The pipeline lives in lc-core.sql and is shared with lc-summary.sql; this
-- file is only the detail output. For the management view — one row per
-- شماره گشایش × شماره سفارش — use lc-summary.sql.

-- @include lc-core.sql

;WITH OutputRows AS (
    SELECT
        fc.*,
        rd.RemainingDebt,
        rd.DisplayedDebit,
        SUM(rd.RemainingDebt) OVER (
            ORDER BY fc.DueDate, fc.InvoiceDate, fc.CreditItemID
            ROWS UNBOUNDED PRECEDING
        ) AS MablaghKol,
        SYS3.fn_DateToShamsiDate(fc.DueDate)     AS ShamsiDueDate,
        SYS3.fn_DateToShamsiDate(fc.InvoiceDate) AS ShamsiInvoiceDate,
        SYS3.fn_DateToShamsiDate(fc.Date)        AS ShamsiVoucherDate,
        CASE WHEN fc.OpeningDate IS NOT NULL
            THEN SYS3.fn_DateToShamsiDate(fc.OpeningDate)
            ELSE NULL
        END AS ShamsiOpeningDate
    FROM #FinalCalc fc
    INNER JOIN @RowDebt rd ON rd.CreditItemID = fc.CreditItemID
    WHERE rd.IsInDisplayRange = 1
)

-- =============================================
-- خروجی نهایی
-- =============================================
SELECT
    ROW_NUMBER() OVER (ORDER BY o.DueDate, o.InvoiceDate)  AS [ردیف],
    o.ShamsiDueDate                           AS [تاریخ سررسید],
    o.ShamsiInvoiceDate                       AS [تاریخ فاکتور],
    o.ShamsiVoucherDate                       AS [تاریخ سند],
    o.[4]                                     AS [طرف بستانکار],
    o.[5]                                     AS [بانک عامل],
    o.Description                             AS [شرح بدهی],
    o.ExtractedOrderNumber                    AS [شماره سفارش],
    o.ExtractedLCNumber                       AS [شماره اعتبار],
    FORMAT(o.CreditAmount,   N'N0', 'en-US')  AS [بستانکار],
    FORMAT(o.AllocatedDebit, N'N0', 'en-US')  AS [بدهکار],
    FORMAT(o.CreditAmount,   N'N0', 'en-US')  AS [مبلغ فاکتور],
    CASE WHEN o.[5] LIKE N'%ملت%' THEN N'-'
         ELSE FORMAT(o.MianDaryaft, N'N0', 'en-US')
    END                                       AS [میان دریافت],
    CASE WHEN o.[5] LIKE N'%ملت%' THEN N'-'
         ELSE FORMAT(o.PishDaryaft, N'N0', 'en-US')
    END                                       AS [پیش دریافت],
    FORMAT(o.MablaghJoz,     N'N0', 'en-US')  AS [مبلغ جزء],
    FORMAT(o.MablaghKol,     N'N0', 'en-US')  AS [مبلغ کل],
    FORMAT(o.DisplayedDebit, N'N0', 'en-US') AS [مبلغ پرداخت شده],
    FORMAT(o.RemainingDebt,  N'N0', 'en-US')  AS [مانده بدهی],
    CASE
        WHEN o.RemainingDebt = 0 THEN N'تسویه شده'
        WHEN o.RemainingDebt > 0 THEN N'مازاد پرداخت'
        ELSE N'معوق'
    END                                       AS [وضعیت بدهی],
    CASE WHEN o.OpeningAmount > 0
        THEN FORMAT(o.OpeningAmount, N'N0', 'en-US')
        ELSE NULL
    END                                       AS [مبلغ گشایش],
    o.ShamsiOpeningDate                       AS [تاریخ گشایش],
    CASE WHEN o.OpeningDurationDays IS NOT NULL
        THEN CAST(o.OpeningDurationDays AS NVARCHAR(10)) + N' روز'
        ELSE NULL
    END                                       AS [مدت گشایش],
    o.Term_Days_Final                         AS [مهلت روز],
    o.DateSource                              AS [منبع تاریخ],
    o.[6]                                     AS [شرح اعتبار اسنادی]
FROM OutputRows o
WHERE (
    @DebtStatus IS NULL
    OR LTRIM(RTRIM(@DebtStatus)) = N''
    OR CASE
        WHEN o.RemainingDebt = 0 THEN N'تسویه شده'
        WHEN o.RemainingDebt > 0 THEN N'مازاد پرداخت'
        ELSE N'معوق'
    END LIKE N'%' + LTRIM(RTRIM(@DebtStatus)) + N'%'
)
ORDER BY o.DueDate, o.InvoiceDate;
