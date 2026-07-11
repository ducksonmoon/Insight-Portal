-- گزارش اعتبارات اسنادی (ال سی)
-- Parameters are bound by the app: @dl4, @dl5, @OrderNumber, @STARTDATE, @ENDDATE, @DebtStatus

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
        vi.Description,
        dl6.Title                    AS DL6Title,
        dl4.Title                    AS DL4Title
    FROM fin3.VoucherItem vi
    INNER JOIN fin3.Voucher vh  ON vi.VoucherRef = vh.VoucherID
    INNER JOIN fin3.DL      dl6 ON vi.DLLevel6   = dl6.Code
    INNER JOIN fin3.DL      dl4 ON vi.DLLevel4   = dl4.Code
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
        rn.DL6Code,
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
        CASE
            WHEN PATINDEX(N'%اعتبار %[0-9]%', aad.DL6Title) > 0
            THEN LTRIM(RTRIM(REPLACE(
                SUBSTRING(
                    SUBSTRING(aad.DL6Title,
                        PATINDEX(N'%اعتبار %[0-9]%', aad.DL6Title) + 7,
                        LEN(aad.DL6Title)),
                    1,
                    CASE
                        WHEN PATINDEX(N'%[^0-9]%',
                            SUBSTRING(aad.DL6Title,
                                PATINDEX(N'%اعتبار %[0-9]%', aad.DL6Title) + 7,
                                LEN(aad.DL6Title)) + N' ') > 0
                        THEN PATINDEX(N'%[^0-9]%',
                            SUBSTRING(aad.DL6Title,
                                PATINDEX(N'%اعتبار %[0-9]%', aad.DL6Title) + 7,
                                LEN(aad.DL6Title)) + N' ') - 1
                        ELSE LEN(aad.DL6Title)
                    END
                ), N' ', N'')))
            ELSE NULL
        END AS ExtractedLCNumber,
        CASE
            WHEN CHARINDEX(N'سفارش ', aad.DL6Title) > 0
            THEN LTRIM(RTRIM(REPLACE(
                SUBSTRING(
                    SUBSTRING(aad.DL6Title,
                        CHARINDEX(N'سفارش ', aad.DL6Title) + 7,
                        LEN(aad.DL6Title)),
                    1,
                    CASE
                        WHEN PATINDEX(N'%[^A-Za-z0-9_-]%',
                            SUBSTRING(aad.DL6Title,
                                CHARINDEX(N'سفارش ', aad.DL6Title) + 7,
                                LEN(aad.DL6Title)) + N' ') > 0
                        THEN PATINDEX(N'%[^A-Za-z0-9_-]%',
                            SUBSTRING(aad.DL6Title,
                                CHARINDEX(N'سفارش ', aad.DL6Title) + 7,
                                LEN(aad.DL6Title)) + N' ') - 1
                        ELSE LEN(aad.DL6Title)
                    END
                ), N' ', N'')))
            ELSE NULL
        END AS ExtractedOrderNumber,
        CASE
            WHEN aad.DL6Title LIKE N'%روزه%'
                AND CHARINDEX(N'-', aad.DL6Title) > 0
                AND CHARINDEX(N'-', aad.DL6Title) < CHARINDEX(N'روزه', aad.DL6Title)
            THEN TRY_CAST(LTRIM(RTRIM(REPLACE(
                SUBSTRING(aad.DL6Title,
                    CHARINDEX(N'-', aad.DL6Title) + 1,
                    CHARINDEX(N'روزه', aad.DL6Title)
                    - CHARINDEX(N'-', aad.DL6Title) - 1),
                N' ', N''))) AS INT)
            ELSE NULL
        END AS Term_Days_Final,
        CASE
            WHEN PATINDEX(N'%14[0-9][0-9]/[0-9][0-9]/[0-9][0-9]%', aad.Description) > 0
            THEN SUBSTRING(aad.Description,
                PATINDEX(N'%14[0-9][0-9]/[0-9][0-9]/[0-9][0-9]%', aad.Description), 10)
            ELSE NULL
        END AS ShamsiDateStrFromDesc
    FROM A_WithAllocatedDebit aad
    INNER JOIN fin3.DL dl5 ON dl5.Code = aad.DL5Code
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

FilteredByDueDate AS (
    SELECT *
    FROM WithDueDate wc
    WHERE (
        wc.DueDate BETWEEN @STARTDATE AND @ENDDATE
        OR (@STARTDATE IS NULL AND @ENDDATE IS NULL)
    )
),

FilterKeys AS (
    SELECT DISTINCT fd.DL4Code, fd.DL5Code
    FROM FilteredByDueDate fd
),

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
    INNER JOIN FilterKeys  fk   ON fk.DL4Code = vio.DLLevel4
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
        fd.CreditItemID,
        lco.OpeningAmount,
        lco.OpeningDate,
        lco.LCOpeningFullTitle,
        CASE
            WHEN fd.ExtractedLCNumber IS NOT NULL
                AND lco.LCOpeningFullTitle LIKE N'%' + fd.ExtractedLCNumber + N'%'
            THEN 1
            ELSE 2
        END AS MatchPriority
    FROM FilteredByDueDate fd
    INNER JOIN LCOpeningInfo lco
        ON lco.DLLevel4 = fd.DL4Code
        AND lco.DLLevel5 = fd.DL5Code
        AND (
            (fd.ExtractedLCNumber IS NOT NULL
                AND lco.LCOpeningFullTitle LIKE N'%' + fd.ExtractedLCNumber + N'%')
            OR
            (fd.ExtractedOrderNumber IS NOT NULL
                AND lco.LCOpeningFullTitle LIKE N'%' + fd.ExtractedOrderNumber + N'%')
        )
),

OpeningMatch AS (
    SELECT
        oc.CreditItemID,
        oc.OpeningAmount,
        oc.OpeningDate,
        oc.LCOpeningFullTitle,
        ROW_NUMBER() OVER (
            PARTITION BY oc.CreditItemID
            ORDER BY oc.MatchPriority, oc.OpeningAmount DESC
        ) AS MatchRank
    FROM OpeningCandidates oc
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
    FROM FilteredByDueDate fd
    LEFT JOIN OpeningMatch om
        ON om.CreditItemID = fd.CreditItemID
        AND om.MatchRank = 1
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

DECLARE @ApplyOrderPayableLogic BIT = CASE
    WHEN @OrderNumber IS NOT NULL AND LTRIM(RTRIM(@OrderNumber)) <> N'' THEN 1
    ELSE 0
END;

DECLARE @RowDebt TABLE (
    CreditItemID   BIGINT         NOT NULL PRIMARY KEY,
    RemainingDebt  DECIMAL(38, 0) NOT NULL,
    DisplayedDebit DECIMAL(38, 0) NOT NULL
);

IF @ApplyOrderPayableLogic = 0
BEGIN
    INSERT INTO @RowDebt (CreditItemID, RemainingDebt, DisplayedDebit)
    SELECT
        fc.CreditItemID,
        CAST(fc.AllocatedDebit AS DECIMAL(38, 0)) - CAST(fc.MablaghJoz AS DECIMAL(38, 0)),
        CAST(fc.AllocatedDebit AS DECIMAL(38, 0))
    FROM #FinalCalc fc;
END
ELSE
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
        CAST(fc.MablaghJoz AS DECIMAL(38, 0))     AS MablaghJoz,
        CAST(fc.AllocatedDebit AS DECIMAL(38, 0)) AS AllocatedDebit,
        CAST(0 AS BIT)                            AS IsSettled,
        CAST(0 AS DECIMAL(38, 0))                   AS AccumulatedPool
    INTO #OrderSettlement
    FROM #FinalCalc fc;

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
        WHERE ISNULL(ExtractedOrderNumber, N'') = ISNULL(@CurrentOrder, N'');

        WHILE @ProcessSeq <= @MaxProcessSeq
        BEGIN
            SELECT @LoopAllocatedDebit = AllocatedDebit
            FROM #OrderSettlement
            WHERE ISNULL(ExtractedOrderNumber, N'') = ISNULL(@CurrentOrder, N'')
              AND RowSeq = @ProcessSeq;

            SET @PaymentPool = @PaymentPool + @LoopAllocatedDebit;

            WHILE 1 = 1
            BEGIN
                SELECT TOP 1
                    @LoopSeq = RowSeq,
                    @LoopPayable = MablaghJoz
                FROM #OrderSettlement
                WHERE IsSettled = 0
                  AND ISNULL(ExtractedOrderNumber, N'') = ISNULL(@CurrentOrder, N'')
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
                        WHERE ISNULL(ExtractedOrderNumber, N'') = ISNULL(@CurrentOrder, N'')
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
                    WHERE ISNULL(ExtractedOrderNumber, N'') = ISNULL(@CurrentOrder, N'')
                      AND RowSeq = @LoopSeq;

                    BREAK;
                END

                UPDATE #OrderSettlement
                SET IsSettled = 1,
                    AccumulatedPool = MablaghJoz
                WHERE ISNULL(ExtractedOrderNumber, N'') = ISNULL(@CurrentOrder, N'')
                  AND RowSeq = @LoopSeq;

                SET @PaymentPool = CASE
                    WHEN @PaymentPool >= @LoopPayable THEN @PaymentPool - @LoopPayable
                    ELSE 0
                END;
            END

            SET @ProcessSeq = @ProcessSeq + 1;
        END

        IF @PaymentPool > 0
        BEGIN
            UPDATE #OrderSettlement
            SET AccumulatedPool = CASE
                WHEN AccumulatedPool >= MablaghJoz
                    THEN AccumulatedPool + @PaymentPool
                ELSE MablaghJoz + @PaymentPool
            END
            WHERE ISNULL(ExtractedOrderNumber, N'') = ISNULL(@CurrentOrder, N'')
              AND RowSeq = @MaxProcessSeq
              AND IsSettled = 1;

            SET @PaymentPool = 0;
        END

        FETCH NEXT FROM order_cursor INTO @CurrentOrder;
    END

    CLOSE order_cursor;
    DEALLOCATE order_cursor;

    INSERT INTO @RowDebt (CreditItemID, RemainingDebt, DisplayedDebit)
    SELECT
        os.CreditItemID,
        CASE
            WHEN ABS(os.AccumulatedPool - os.MablaghJoz) <= @Tolerance THEN 0
            ELSE os.AccumulatedPool - os.MablaghJoz
        END,
        CASE
            WHEN ABS(os.AccumulatedPool - os.MablaghJoz) <= @Tolerance THEN os.MablaghJoz
            ELSE os.AccumulatedPool
        END
    FROM #OrderSettlement os;

    DROP TABLE #OrderSettlement;
END

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
)

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
