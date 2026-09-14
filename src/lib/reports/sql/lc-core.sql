-- Shared core of the LC (اعتبارات اسنادی) reports — not a report itself.
--
-- Included by lc.sql (ریز اقلام) and lc-summary.sql (سطح اعتبار) via the
-- `-- @include` directive in src/lib/reports/sql-loader.ts. Both need the same
-- pipeline — parse the detail-account titles, match the off-balance opening,
-- settle each order FIFO — and differ only in the final SELECT. Keeping one
-- copy is the point: a correction here reaches both reports.
--
-- Leaves behind, for the including file to select from:
--   #FinalCalc  one row per LC invoice line, parsed, dated and costed
--   @RowDebt    settlement result per line: RemainingDebt (pool − payable, so
--               negative means still owed), DisplayedDebit, IsInDisplayRange
--   #LcAccount / #LcTitle / #LcOpening  per-detail-account lookups
--
-- Parameters it reads, all bound by the app and all optional:
--   @dl4 @dl5 @OrderNumber @STARTDATE @ENDDATE
-- (@DebtStatus is applied by the including file, which owns the status labels.)

-- @include lc-accounts.sql

/* Matching an LC detail account to its off-balance opening record.
 *
 * The opening accounts are named by the LC identifier itself
 * (0011404495541351, 1404238486327/5946904466410513), which is exactly what
 * the *...* block in the liability title holds — so each of that block's
 * slash-separated segments is tried against the opening title first, and only
 * then the order number, which in this customer's data never appears in an
 * opening title at all.
 *
 * The previous version could not do this. Its LC parse returned the empty
 * string for every row, and LIKE N'%' + N'' + N'%' is LIKE N'%%', which
 * matches every opening sharing the same counterparty and bank; ROW_NUMBER
 * then kept the largest by amount. So 1,098 of 1,279 rows displayed a
 * مبلغ گشایش belonging to a different LC of the same supplier — two distinct
 * orders both showing the same 1,065,100,000,000 rial, for instance. Rows with
 * no genuine match now correctly show none, which is why that count falls
 * to 560.
 *
 * The LEN(...) >= 6 floor guards the failure this data can actually produce: a
 * short token matches many openings through LIKE. Real order numbers here are
 * 7-10 characters and LC identifier segments 12 or more, so nothing legitimate
 * is excluded.
 */
;WITH
LCOpeningInfo AS (
    SELECT
        vio.DLLevel4,
        vio.DLLevel5,
        dl6o.Title                   AS LCOpeningFullTitle,
        SUM(ISNULL(vio.Debit, 0))    AS OpeningAmount,
        MIN(CASE
            WHEN vio.Debit > 0 AND vho.VoucherTypeRef = 21
            THEN vho.Date
        END)                         AS OpeningDate
    FROM fin3.VoucherItem vio
    INNER JOIN fin3.Voucher vho ON vio.VoucherRef = vho.VoucherID
    INNER JOIN fin3.DL     dl6o ON vio.DLLevel6   = dl6o.Code
        AND dl6o.DLTypeRef = vio.DLTypeRef6
    INNER JOIN (SELECT DISTINCT DL4Code, DL5Code FROM #LcAccount) fk
        ON fk.DL4Code = vio.DLLevel4
        AND fk.DL5Code = vio.DLLevel5
    WHERE
        vio.SLCode = N'9301'
        AND vio.AccountGroupRef = CONVERT(bigint, 9)
        AND vho.IsTemporary = 0
        AND vho.State <> 2
        AND vho.VoucherTypeRef IN (1,2,3,4,8,10,12,13,14,15,16,17,18,19,20,21)
        AND vho.LedgerRef = 1
    GROUP BY vio.DLLevel4, vio.DLLevel5, dl6o.Title
),

OpeningCandidates AS (
    SELECT
        k.DL4Code, k.DL5Code, k.DL6Code,
        lco.OpeningAmount, lco.OpeningDate, lco.LCOpeningFullTitle,
        1 AS MatchPriority
    FROM #LcAccount k
    INNER JOIN #LcTitle ltp ON ltp.Code = k.DL6Code AND ltp.DLTypeRef = k.DL6TypeRef
    CROSS APPLY STRING_SPLIT(ltp.ExtractedLCNumber, N'/') seg
    INNER JOIN LCOpeningInfo lco
        ON lco.DLLevel4 = k.DL4Code
        AND lco.DLLevel5 = k.DL5Code
        AND LEN(seg.value) >= 6
        AND lco.LCOpeningFullTitle LIKE N'%' + seg.value + N'%'

    UNION ALL

    SELECT
        k.DL4Code, k.DL5Code, k.DL6Code,
        lco.OpeningAmount, lco.OpeningDate, lco.LCOpeningFullTitle,
        2 AS MatchPriority
    FROM #LcAccount k
    INNER JOIN #LcTitle ltp ON ltp.Code = k.DL6Code AND ltp.DLTypeRef = k.DL6TypeRef
    INNER JOIN LCOpeningInfo lco
        ON lco.DLLevel4 = k.DL4Code
        AND lco.DLLevel5 = k.DL5Code
        AND ltp.ExtractedOrderNumber IS NOT NULL
        AND LEN(ltp.ExtractedOrderNumber) >= 6
        AND lco.LCOpeningFullTitle LIKE N'%' + ltp.ExtractedOrderNumber + N'%'
),

OpeningRanked AS (
    SELECT
        oc.DL4Code, oc.DL5Code, oc.DL6Code,
        oc.OpeningAmount, oc.OpeningDate, oc.LCOpeningFullTitle,
        ROW_NUMBER() OVER (
            PARTITION BY oc.DL4Code, oc.DL5Code, oc.DL6Code
            ORDER BY oc.MatchPriority, oc.OpeningAmount DESC
        ) AS MatchRank
    FROM (
        -- Two identifier segments can point at the same opening; collapse them
        -- before ranking, so "best match" ranks distinct openings.
        SELECT DISTINCT DL4Code, DL5Code, DL6Code,
                        OpeningAmount, OpeningDate, LCOpeningFullTitle, MatchPriority
        FROM OpeningCandidates
    ) oc
)
SELECT DL4Code, DL5Code, DL6Code, OpeningAmount, OpeningDate, LCOpeningFullTitle
INTO #LcOpening
FROM OpeningRanked
WHERE MatchRank = 1;

CREATE CLUSTERED INDEX IX_LcOpening ON #LcOpening (DL4Code, DL5Code, DL6Code);


IF OBJECT_ID('tempdb..#FinalCalc') IS NOT NULL
    DROP TABLE #FinalCalc;

;WITH
AllRows AS (
    SELECT
        vi.VoucherItemID,
        vh.Date,
        vi.DLLevel4                  AS DL4Code,
        vi.DLLevel5                  AS DL5Code,
        vi.DLLevel6                  AS DL6Code,
        ISNULL(vi.Credit, 0)         AS Credit,
        ISNULL(vi.Debit,  0)         AS Debit,
        vi.DLTypeRef5                AS DL5TypeRef,
        vi.DLTypeRef6                AS DL6TypeRef,
        vi.Description,
        dl6.Title                    AS DL6Title,
        dl4.Title                    AS DL4Title
    FROM fin3.VoucherItem vi
    INNER JOIN fin3.Voucher vh  ON vi.VoucherRef = vh.VoucherID
    INNER JOIN fin3.DL      dl6 ON vi.DLLevel6   = dl6.Code
        AND dl6.DLTypeRef = vi.DLTypeRef6
    INNER JOIN fin3.DL      dl4 ON vi.DLLevel4   = dl4.Code
        AND dl4.DLTypeRef = vi.DLTypeRef4
        AND (dl4.Title = @dl4 OR @dl4 IS NULL)
    INNER JOIN SYS3.Lookup  lp1 ON lp1.Code = vi.DLLevel5
        AND lp1.Type = N'BankG'
    WHERE
        vi.SLCode = N'3009'
        AND vh.IsTemporary = 0
        AND vh.State <> 2
        AND vh.VoucherTypeRef IN (1,2,3,4,8,10,12,13,14,15,16,17,18,19,20,21)
        AND vh.LedgerRef = 1
        AND (lp1.Code = @dl5 OR @dl5 IS NULL)
        AND (
            (ISNULL(vi.Credit, 0) > 0 AND ISNULL(vi.Debit, 0) = 0)
            OR
            (ISNULL(vi.Debit,  0) > 0 AND ISNULL(vi.Credit, 0) = 0)
        )
),

RowsWithLag AS (
    SELECT
        ar.*,
        CASE WHEN ar.Credit > 0 THEN 'A' ELSE 'B' END AS RowType,
        LAG(CASE WHEN ar.Credit > 0 THEN 'A' ELSE 'B' END)
            OVER (
                PARTITION BY ar.DL4Code, ar.DL5Code, ar.DL6Code
                ORDER BY ar.Date, ar.VoucherItemID
            ) AS PrevRowType
    FROM AllRows ar
),

RowsWithMeta AS (
    SELECT
        rl.*,
        SUM(
            CASE
                WHEN rl.RowType = 'A'
                AND (rl.PrevRowType = 'B' OR rl.PrevRowType IS NULL)
                THEN 1
                ELSE 0
            END
        ) OVER (
            PARTITION BY rl.DL4Code, rl.DL5Code, rl.DL6Code
            ORDER BY rl.Date, rl.VoucherItemID
            ROWS UNBOUNDED PRECEDING
        ) AS GroupNumber
    FROM RowsWithLag rl
),

RowsNumbered AS (
    SELECT
        rw.*,
        ROW_NUMBER() OVER (
            PARTITION BY rw.DL4Code, rw.DL5Code, rw.DL6Code,
                         rw.GroupNumber, rw.RowType
            ORDER BY rw.Date, rw.VoucherItemID
        ) AS TypeRowNum,
        SUM(CASE WHEN rw.RowType = 'A' THEN 1 ELSE 0 END) OVER (
            PARTITION BY rw.DL4Code, rw.DL5Code, rw.DL6Code, rw.GroupNumber
        ) AS A_Count,
        SUM(CASE WHEN rw.RowType = 'B' THEN 1 ELSE 0 END) OVER (
            PARTITION BY rw.DL4Code, rw.DL5Code, rw.DL6Code, rw.GroupNumber
        ) AS B_Count,
        SUM(CASE WHEN rw.RowType = 'B' THEN rw.Debit ELSE 0 END) OVER (
            PARTITION BY rw.DL4Code, rw.DL5Code, rw.DL6Code, rw.GroupNumber
        ) AS B_TotalSum
    FROM RowsWithMeta rw
),

B_WithReverseSum AS (
    SELECT
        rn.DL4Code,
        rn.DL5Code,
        rn.DL6Code,
        rn.GroupNumber,
        rn.TypeRowNum   AS B_RowNum,
        rn.Debit        AS B_Debit,
        rn.B_TotalSum
            - ISNULL(SUM(rn.Debit) OVER (
                PARTITION BY rn.DL4Code, rn.DL5Code,
                             rn.DL6Code, rn.GroupNumber
                ORDER BY rn.TypeRowNum
                ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
            ), 0)       AS B_SumFromHere
    FROM RowsNumbered rn
    WHERE rn.RowType = 'B'
),

A_WithAllocatedDebit AS (
    SELECT
        rn.VoucherItemID,
        rn.DL4Code,
        rn.DL4Title,
        rn.DL5Code,
        rn.DL5TypeRef,
        rn.DL6Code,
        rn.DL6TypeRef,
        rn.Date,
        rn.Credit,
        rn.Description,
        rn.DL6Title,
        rn.TypeRowNum   AS A_RowNum,
        rn.A_Count,
        rn.B_Count,
        CASE
            WHEN rn.TypeRowNum = rn.A_Count
                AND rn.B_Count >= rn.A_Count
            THEN ISNULL(brs.B_SumFromHere, 0)
            WHEN b_match.B_Debit IS NOT NULL
            THEN b_match.B_Debit
            ELSE 0
        END AS AllocatedDebit
    FROM RowsNumbered rn
    LEFT JOIN B_WithReverseSum b_match
        ON b_match.DL4Code      = rn.DL4Code
        AND b_match.DL5Code     = rn.DL5Code
        AND b_match.DL6Code     = rn.DL6Code
        AND b_match.GroupNumber = rn.GroupNumber
        AND b_match.B_RowNum    = rn.TypeRowNum
        AND NOT (rn.TypeRowNum = rn.A_Count AND rn.B_Count >= rn.A_Count)
    LEFT JOIN B_WithReverseSum brs
        ON brs.DL4Code          = rn.DL4Code
        AND brs.DL5Code         = rn.DL5Code
        AND brs.DL6Code         = rn.DL6Code
        AND brs.GroupNumber     = rn.GroupNumber
        AND brs.B_RowNum        = rn.A_Count
        AND rn.TypeRowNum       = rn.A_Count
        AND rn.B_Count         >= rn.A_Count
    WHERE rn.RowType = 'A'
),

CalculatedDays AS (
    SELECT
        aad.Date,
        aad.DL4Title                 AS [4],
        aad.DL4Code,
        dl5.Title                    AS [5],
        aad.DL5Code,
        aad.DL6Title                 AS [6],
        aad.DL6Code,
        aad.Credit                   AS CreditAmount,
        aad.VoucherItemID            AS CreditItemID,
        aad.Description,
        aad.AllocatedDebit,
        -- Parsed once per detail account in LcTitleParse, not once per
        -- voucher row: 139 titles back 2,304 rows here.
        ltp.ExtractedLCNumber,
        ltp.ExtractedOrderNumber,
        ltp.Term_Days_Final,
        -- استخراج تاریخ شمسی از شرح سند
        CASE
            WHEN PATINDEX(N'%14[0-9][0-9]/[0-9][0-9]/[0-9][0-9]%', aad.Description) > 0
            THEN SUBSTRING(aad.Description,
                PATINDEX(N'%14[0-9][0-9]/[0-9][0-9]/[0-9][0-9]%', aad.Description), 10)
            ELSE NULL
        END AS ShamsiDateStrFromDesc
    FROM A_WithAllocatedDebit aad
    INNER JOIN fin3.DL dl5 ON dl5.Code = aad.DL5Code
        AND dl5.DLTypeRef = aad.DL5TypeRef
    INNER JOIN #LcTitle ltp ON ltp.Code = aad.DL6Code
        AND ltp.DLTypeRef = aad.DL6TypeRef
),

WithInvoiceDate AS (
    SELECT
        cd.*,
        CASE
            WHEN TRY_CAST(LEFT(cd.ShamsiDateStrFromDesc, 4) AS INT) BETWEEN 1380 AND 1420
                AND TRY_CAST(SUBSTRING(cd.ShamsiDateStrFromDesc,6,2) AS INT) BETWEEN 1 AND 12
                AND TRY_CAST(RIGHT(cd.ShamsiDateStrFromDesc, 2) AS INT) BETWEEN 1 AND 31
            THEN SYS3.fn_ShamsiDateToDate(
                TRY_CAST(LEFT(cd.ShamsiDateStrFromDesc, 4) AS INT),
                TRY_CAST(SUBSTRING(cd.ShamsiDateStrFromDesc,6,2) AS INT),
                TRY_CAST(RIGHT(cd.ShamsiDateStrFromDesc, 2) AS INT))
            ELSE cd.Date
        END AS InvoiceDate,
        CASE
            WHEN TRY_CAST(LEFT(cd.ShamsiDateStrFromDesc, 4) AS INT) BETWEEN 1380 AND 1420
                AND TRY_CAST(SUBSTRING(cd.ShamsiDateStrFromDesc,6,2) AS INT) BETWEEN 1 AND 12
                AND TRY_CAST(RIGHT(cd.ShamsiDateStrFromDesc, 2) AS INT) BETWEEN 1 AND 31
            THEN N'از شرح'
            ELSE N'Fallback-تاریخ سند'
        END AS DateSource
    FROM CalculatedDays cd
),

WithDueDate AS (
    SELECT
        wi.*,
        DATEADD(DAY, ISNULL(wi.Term_Days_Final, 0), wi.InvoiceDate) AS DueDate
    FROM WithInvoiceDate wi
    WHERE (wi.ExtractedOrderNumber = @OrderNumber OR @OrderNumber IS NULL)
),

FilteredBase AS (
    SELECT *
    FROM WithDueDate wc
),

WithLCOpening AS (
    SELECT
        fd.*,
        ISNULL(om.OpeningAmount, 0) AS OpeningAmount,
        om.OpeningDate,
        om.LCOpeningFullTitle,
        CASE
            WHEN fd.[5] LIKE N'%ملت%' THEN 0
            ELSE ROUND(fd.CreditAmount * 0.05, 0)
        END AS MianDaryaft,
        CASE
            WHEN fd.[5] LIKE N'%ملت%' THEN 0
            ELSE ROUND(fd.CreditAmount * 0.05, 0)
        END AS PishDaryaft,
        CASE
            WHEN om.OpeningDate IS NOT NULL
            THEN DATEDIFF(DAY, om.OpeningDate, fd.DueDate)
            ELSE NULL
        END AS OpeningDurationDays
    FROM FilteredBase fd
    LEFT JOIN #LcOpening om
        ON om.DL4Code = fd.DL4Code
        AND om.DL5Code = fd.DL5Code
        AND om.DL6Code = fd.DL6Code
),

FinalCalculations AS (
    SELECT
        wl.*,
        CASE
            WHEN wl.[5] LIKE N'%ملت%' THEN wl.CreditAmount
            ELSE wl.CreditAmount - (wl.MianDaryaft + wl.PishDaryaft)
        END AS MablaghJoz
    FROM WithLCOpening wl
)

SELECT *
INTO #FinalCalc
FROM FinalCalculations;

CREATE CLUSTERED INDEX IX_FinalCalc_PayableOrder
    ON #FinalCalc (ExtractedOrderNumber, DueDate, InvoiceDate, CreditItemID);

IF OBJECT_ID('tempdb..#InScopeOrders') IS NOT NULL
    DROP TABLE #InScopeOrders;

SELECT DISTINCT fc.ExtractedOrderNumber
INTO #InScopeOrders
FROM #FinalCalc fc
WHERE fc.ExtractedOrderNumber IS NOT NULL
  AND (
        (@OrderNumber IS NOT NULL AND LTRIM(RTRIM(@OrderNumber)) <> N''
         AND fc.ExtractedOrderNumber = LTRIM(RTRIM(@OrderNumber)))
        OR (
            (@OrderNumber IS NULL OR LTRIM(RTRIM(@OrderNumber)) = N'')
            AND (
                (@STARTDATE IS NULL AND @ENDDATE IS NULL)
                OR fc.DueDate BETWEEN @STARTDATE AND @ENDDATE
            )
        )
    );

-- Small table (one row per in-scope order), but it's probed once per row of
-- #FinalCalc below via NOT EXISTS, and again once per order inside the
-- settlement loop further down — worth a seek instead of a scan either way.
CREATE CLUSTERED INDEX IX_InScopeOrders ON #InScopeOrders (ExtractedOrderNumber);

DECLARE @RowDebt TABLE (
    CreditItemID      BIGINT         NOT NULL PRIMARY KEY,
    RemainingDebt     DECIMAL(38, 0) NOT NULL,
    DisplayedDebit    DECIMAL(38, 0) NOT NULL,
    IsInDisplayRange  BIT            NOT NULL
);

-- Per-row debt for rows without order-level settlement
INSERT INTO @RowDebt (CreditItemID, RemainingDebt, DisplayedDebit, IsInDisplayRange)
SELECT
    fc.CreditItemID,
    CAST(fc.AllocatedDebit AS DECIMAL(38, 0)) - CAST(fc.MablaghJoz AS DECIMAL(38, 0)),
    CAST(fc.AllocatedDebit AS DECIMAL(38, 0)),
    CASE
        WHEN fc.DueDate BETWEEN @STARTDATE AND @ENDDATE
            OR (@STARTDATE IS NULL AND @ENDDATE IS NULL)
        THEN CAST(1 AS BIT)
        ELSE CAST(0 AS BIT)
    END
FROM #FinalCalc fc
WHERE fc.ExtractedOrderNumber IS NULL
   OR NOT EXISTS (
        SELECT 1
        FROM #InScopeOrders iso
        WHERE iso.ExtractedOrderNumber = fc.ExtractedOrderNumber
    );

IF EXISTS (SELECT 1 FROM #InScopeOrders)
BEGIN
    IF OBJECT_ID('tempdb..#OrderSettlement') IS NOT NULL
        DROP TABLE #OrderSettlement;

    SELECT
        ROW_NUMBER() OVER (
            PARTITION BY fc.ExtractedOrderNumber
            ORDER BY fc.DueDate, fc.InvoiceDate, fc.CreditItemID
        ) AS RowSeq,
        fc.CreditItemID,
        fc.ExtractedOrderNumber,
        fc.DueDate,
        CAST(fc.MablaghJoz AS DECIMAL(38, 0))     AS MablaghJoz,
        CAST(fc.AllocatedDebit AS DECIMAL(38, 0)) AS AllocatedDebit,
        CAST(0 AS BIT)                            AS IsSettled,
        CAST(0 AS DECIMAL(38, 0))                   AS AccumulatedPool,
        CAST(0 AS BIT)                            AS IsInDisplayRange
    INTO #OrderSettlement
    FROM #FinalCalc fc
    INNER JOIN #InScopeOrders iso
        ON iso.ExtractedOrderNumber = fc.ExtractedOrderNumber;

    -- The cursor loop below issues one point/range lookup against this table
    -- per row it processes (find the next unsettled row, mark it settled,
    -- advance). Without an index every one of those is a full scan of the
    -- *whole* table (all orders, not just the current one) — O(rows²)
    -- overall. ExtractedOrderNumber is guaranteed NOT NULL here (it came
    -- through the INNER JOIN above against #InScopeOrders, which is itself
    -- filtered to non-null order numbers — see #InScopeOrders below), so
    -- every lookup against this table can use a plain equality seek.
    CREATE CLUSTERED INDEX IX_OrderSettlement ON #OrderSettlement (ExtractedOrderNumber, RowSeq);

    DECLARE
        @Tolerance            DECIMAL(38, 0) = 150000,
        @PaymentPool          DECIMAL(38, 0) = 0,
        @ProcessSeq           INT = 1,
        @MaxProcessSeq        INT,
        @CurrentOrder         NVARCHAR(500),
        @LoopSeq              INT,
        @LoopPayable          DECIMAL(38, 0),
        @LoopAllocatedDebit   DECIMAL(38, 0);

    DECLARE order_cursor CURSOR LOCAL FAST_FORWARD READ_ONLY FOR
        SELECT DISTINCT ExtractedOrderNumber
        FROM #OrderSettlement
        ORDER BY ExtractedOrderNumber;

    OPEN order_cursor;
    FETCH NEXT FROM order_cursor INTO @CurrentOrder;

    WHILE @@FETCH_STATUS = 0
    BEGIN
        SET @PaymentPool = 0;
        SET @ProcessSeq = 1;
        SELECT @MaxProcessSeq = MAX(RowSeq)
        FROM #OrderSettlement
        WHERE ExtractedOrderNumber = @CurrentOrder;

        WHILE @ProcessSeq <= @MaxProcessSeq
        BEGIN
            SELECT @LoopAllocatedDebit = AllocatedDebit
            FROM #OrderSettlement
            WHERE ExtractedOrderNumber = @CurrentOrder
              AND RowSeq = @ProcessSeq;

            SET @PaymentPool = @PaymentPool + @LoopAllocatedDebit;

            WHILE 1 = 1
            BEGIN
                SELECT TOP 1
                    @LoopSeq = RowSeq,
                    @LoopPayable = MablaghJoz
                FROM #OrderSettlement
                WHERE IsSettled = 0
                  AND ExtractedOrderNumber = @CurrentOrder
                ORDER BY RowSeq;

                IF @@ROWCOUNT = 0
                BEGIN
                    IF @PaymentPool > 0
                    BEGIN
                        UPDATE #OrderSettlement
                        SET AccumulatedPool = CASE
                            WHEN AccumulatedPool >= MablaghJoz
                                THEN AccumulatedPool + @PaymentPool
                            ELSE MablaghJoz + @PaymentPool
                        END
                        WHERE ExtractedOrderNumber = @CurrentOrder
                          AND RowSeq = @MaxProcessSeq
                          AND IsSettled = 1;

                        SET @PaymentPool = 0;
                    END

                    BREAK;
                END

                IF @PaymentPool < (@LoopPayable - @Tolerance)
                BEGIN
                    UPDATE #OrderSettlement
                    SET AccumulatedPool = @PaymentPool
                    WHERE ExtractedOrderNumber = @CurrentOrder
                      AND RowSeq = @LoopSeq;

                    BREAK;
                END

                UPDATE #OrderSettlement
                SET IsSettled = 1,
                    AccumulatedPool = MablaghJoz
                WHERE ExtractedOrderNumber = @CurrentOrder
                  AND RowSeq = @LoopSeq;

                SET @PaymentPool = CASE
                    WHEN @PaymentPool >= @LoopPayable THEN @PaymentPool - @LoopPayable
                    ELSE 0
                END;
            END

            SET @ProcessSeq = @ProcessSeq + 1;
        END

        -- Surplus pool after all rows processed (all settled, leftover funds)
        IF @PaymentPool > 0
        BEGIN
            UPDATE #OrderSettlement
            SET AccumulatedPool = CASE
                WHEN AccumulatedPool >= MablaghJoz
                    THEN AccumulatedPool + @PaymentPool
                ELSE MablaghJoz + @PaymentPool
            END
            WHERE ExtractedOrderNumber = @CurrentOrder
              AND RowSeq = @MaxProcessSeq
              AND IsSettled = 1;

            SET @PaymentPool = 0;
        END

        FETCH NEXT FROM order_cursor INTO @CurrentOrder;
    END

    CLOSE order_cursor;
    DEALLOCATE order_cursor;

    UPDATE #OrderSettlement
    SET IsInDisplayRange = 1
    WHERE DueDate BETWEEN @STARTDATE AND @ENDDATE
       OR (@STARTDATE IS NULL AND @ENDDATE IS NULL);

    INSERT INTO @RowDebt (CreditItemID, RemainingDebt, DisplayedDebit, IsInDisplayRange)
    SELECT
        os.CreditItemID,
        CASE
            WHEN ABS(os.AccumulatedPool - os.MablaghJoz) <= @Tolerance THEN 0
            ELSE os.AccumulatedPool - os.MablaghJoz
        END,
        CASE
            WHEN ABS(os.AccumulatedPool - os.MablaghJoz) <= @Tolerance THEN os.MablaghJoz
            ELSE os.AccumulatedPool
        END,
        os.IsInDisplayRange
    FROM #OrderSettlement os;

    DROP TABLE #OrderSettlement;
END

DROP TABLE #InScopeOrders;
DROP TABLE #LcAccount;
DROP TABLE #LcTitle;
DROP TABLE #LcOpening;
