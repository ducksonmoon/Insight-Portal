/*═════════════════════════════════════════════════════
گزارش قراردادهای مرابحه – مبلغ جز و مبلغ کل تجمعی
(اعداد با فرمت English و جداکنندهٔ هزارگان)
═════════════════════════════════════════════════════*/

-- [bound by Insight Portal] DECLARE @LedgerID        bigint      = 1;      -- دفتر
-- [bound by Insight Portal] DECLARE @MurabahaID      bigint      = 1;      -- ContractTypeID مرابحه

-- پارامترهای فیلتر تاریخ دریافت (میلادی)
-- [bound by Insight Portal] DECLARE @ReceiptDateFrom datetime    = NULL;
-- [bound by Insight Portal] DECLARE @ReceiptDateTo   datetime    = NULL;

-- پارامترهای فیلتر تاریخ سررسید (شمسی YYYY/MM/DD)
-- [bound by Insight Portal] DECLARE @DueDateFrom     nvarchar(10) = NULL;
-- [bound by Insight Portal] DECLARE @DueDateTo       nvarchar(10) = NULL;

-- 🆕 پارامترهای جدید فیلتر
-- [bound by Insight Portal] DECLARE @ContractTypeTitleFilter nvarchar(255) = NULL; -- فیلتر برای نوع قرارداد
-- [bound by Insight Portal] DECLARE @BankTitleFilter         nvarchar(255) = NULL; -- فیلتر برای بانک عامل

;WITH C AS
(
    SELECT
        ct.ContractID ,
        /* تاریخ سررسید شمسی خام (از ContractNumber) */
        TRY_CONVERT(nvarchar(10),
            SUBSTRING(ct.ContractNumber ,
                      CHARINDEX(N'سررسید',ct.ContractNumber)+7 , 10))
                                                     AS DueDate_Persian ,
        /* تبدیل تاریخ سررسید شمسی به میلادی برای محاسبه مدت */
        SYS3.fn_ShamsiDateToDate(
            TRY_CAST(SUBSTRING(
                TRY_CONVERT(nvarchar(10),
                    SUBSTRING(ct.ContractNumber ,
                              CHARINDEX(N'سررسید',ct.ContractNumber)+7 , 10))
                , 1, 4) AS int) ,
            TRY_CAST(SUBSTRING(
                TRY_CONVERT(nvarchar(10),
                    SUBSTRING(ct.ContractNumber ,
                              CHARINDEX(N'سررسید',ct.ContractNumber)+7 , 10))
                , 6, 2) AS int) ,
            TRY_CAST(SUBSTRING(
                TRY_CONVERT(nvarchar(10),
                    SUBSTRING(ct.ContractNumber ,
                              CHARINDEX(N'سررسید',ct.ContractNumber)+7 , 10))
                , 9, 2) AS int)
        )                                            AS DueDate_Miladi ,
        ct.ContractTitle         AS DebtDesc ,
        ct.ContractNumber        AS OrderNo ,
        ct.TotalAmount           AS TotalAmount ,
        ct.PrincipalAmount       AS PrincipalAmount ,
        ct.InitialInterestAmount AS InitialInterestAmount ,
        ct.ReceiptDate           AS ReceiptDate ,
        ct.StartDate             AS StartDate ,
        dv.VoucherRef            AS VoucherID ,
        cType.Title              AS ContractTypeTitle
    FROM   RPA3.Contract          ct
    JOIN   FIN3.DL                dlCred ON dlCred.DLID = ct.CounterPartRef
    LEFT   JOIN RPA3.ContractType cType
           ON cType.ContractTypeID = ct.ContractTypeRef     -- [3]
    LEFT   JOIN RPA3.DraftVoucher dv
           ON  dv.DocumentRef   = ct.ContractID
           AND dv.DocumentType  = 1818
    WHERE  ct.LedgerRef       = @LedgerID
      AND  ct.ContractTypeRef = @MurabahaID
      AND  (@ReceiptDateFrom IS NULL OR ct.ReceiptDate >= @ReceiptDateFrom)
      AND  (@ReceiptDateTo   IS NULL OR ct.ReceiptDate <= @ReceiptDateTo)
      AND  (@DueDateFrom IS NULL OR
            TRY_CONVERT(nvarchar(10),
                SUBSTRING(ct.ContractNumber ,
                          CHARINDEX(N'سررسید',ct.ContractNumber)+7 , 10)) >= @DueDateFrom)
      AND  (@DueDateTo   IS NULL OR
            TRY_CONVERT(nvarchar(10),
                SUBSTRING(ct.ContractNumber ,
                          CHARINDEX(N'سررسید',ct.ContractNumber)+7 , 10)) <= @DueDateTo)
      -- 🆕 اضافه شدن فیلتر برای نوع قرارداد
      AND  (@ContractTypeTitleFilter IS NULL OR cType.Title LIKE '%' + @ContractTypeTitleFilter + '%')
),
Agg AS
(
    SELECT
        GROUPING(C.ContractID)           AS IsTotal ,
        C.ContractID                     AS ContractID ,
        C.DueDate_Persian                AS DueDate_Persian ,
        C.DueDate_Miladi                 AS DueDate_Miladi ,
        C.DebtDesc                       AS DebtDesc ,
        C.OrderNo                        AS OrderNo ,
        C.TotalAmount                    AS TotalAmount ,
        C.PrincipalAmount                AS PrincipalAmount ,
        C.InitialInterestAmount          AS InitialInterestAmount ,
        C.ReceiptDate                    AS ReceiptDate ,
        C.StartDate                      AS StartDate ,
        C.VoucherID                      AS VoucherID ,
        C.ContractTypeTitle              AS ContractTypeTitle ,
        SUM(C.TotalAmount) OVER (ORDER BY C.DueDate_Persian, C.ContractID)
                                         AS RunningTotal ,
        SUM(C.TotalAmount)               AS SumTotal ,
        SUM(C.PrincipalAmount)           AS SumPrincipal ,
        SUM(C.InitialInterestAmount)     AS SumInterest
    FROM C
    GROUP BY GROUPING SETS
    (
        (
            C.ContractID , C.DueDate_Persian ,
            C.DueDate_Miladi ,
            C.DebtDesc   , C.OrderNo         ,
            C.TotalAmount, C.PrincipalAmount  ,
            C.InitialInterestAmount           ,
            C.ReceiptDate, C.StartDate        ,
            C.VoucherID  , C.ContractTypeTitle
        ) ,
        ()
    )
),
/* 🆕 CTE نهایی: شماره ردیف با ROW_NUMBER() */
Numbered AS
(
    SELECT
        Agg.* ,
        CASE
            WHEN Agg.IsTotal = 1 THEN NULL
            ELSE ROW_NUMBER() OVER (
                    PARTITION BY Agg.IsTotal
                    ORDER BY Agg.DueDate_Persian , Agg.ContractID)
        END AS RowNo
    FROM Agg
)
/*───────────────────── خروجی نهایی ─────────────────────*/
SELECT
    /* 🆕 ردیف */
    CASE
        WHEN N.IsTotal = 1 THEN N'سر جمع'
        ELSE CAST(N.RowNo AS nvarchar(10))
    END                                                              AS [ردیف] ,
    /* تاریخ سررسید */
    CASE
        WHEN N.IsTotal = 1 THEN NULL
        ELSE TRANSLATE(N.DueDate_Persian ,
                       N'۰۱۲۳۴۵۶۷۸۹' , N'0123456789')
    END                                                              AS [تاریخ سررسید] ,
    /* نوع قرارداد */
    CASE
        WHEN N.IsTotal = 1 THEN NULL
        ELSE N.ContractTypeTitle
    END                                                              AS [نوع قرارداد] ,
    /* بانک عامل */
    CASE
        WHEN N.IsTotal = 1 THEN NULL
        ELSE ISNULL(BankAgg.BankTitle , N.DebtDesc)
    END                                                              AS [بانک عامل] ,
    /* شرح بدهی */
    CASE
        WHEN N.IsTotal = 1 THEN NULL
        ELSE N.OrderNo
    END                                                              AS [شرح بدهی] ,
    /* تاریخ انعقاد شمسی */
    CASE
        WHEN N.IsTotal = 1 THEN NULL
        WHEN N.StartDate IS NULL THEN NULL
        ELSE SYS3.fn_DateToShamsiDate(N.StartDate)
    END                                                              AS [تاریخ انعقاد] ,
    /* اصل */
    FORMAT(
        CASE
            WHEN N.IsTotal = 1 THEN N.SumPrincipal
            ELSE N.PrincipalAmount
        END ,
        N'N0' , 'en-US')                                            AS [اصل] ,
    /* بهره اولیه */
    FORMAT(
        CASE
            WHEN N.IsTotal = 1 THEN N.SumInterest
            ELSE N.InitialInterestAmount
        END ,
        N'N0' , 'en-US')                                            AS [بهره اولیه] ,
    /* مبلغ جز */
    FORMAT(
        CASE
            WHEN N.IsTotal = 1 THEN N.SumTotal
            ELSE N.TotalAmount
        END ,
        N'N0' , 'en-US')                                            AS [مبلغ جز] ,
    /* مبلغ کل تجمعی */
    FORMAT(
        CASE
            WHEN N.IsTotal = 1 THEN N.SumTotal
            ELSE N.RunningTotal
        END ,
        N'N0' , 'en-US')                                            AS [مبلغ کل] ,
    /* تاریخ دریافت شمسی */
    CASE
        WHEN N.IsTotal = 1 THEN NULL
        WHEN N.ReceiptDate IS NULL THEN NULL
        ELSE SYS3.fn_DateToShamsiDate(N.ReceiptDate)
    END                                                              AS [تاریخ دریافت] ,
    /* مدت به ماه */
    CASE
        WHEN N.IsTotal          = 1   THEN NULL
        WHEN N.StartDate        IS NULL THEN NULL
        WHEN N.DueDate_Miladi   IS NULL THEN NULL
        ELSE DATEDIFF(MONTH , N.StartDate , N.DueDate_Miladi)
    END                                                              AS [مدت به ماه]
FROM    Numbered N
OUTER APPLY
(
    SELECT TOP (1) dlBank.Title AS BankTitle
    FROM   FIN3.VoucherItem vi
    CROSS APPLY ( VALUES (vi.DLLevel4),
                         (vi.DLLevel5),
                         (vi.DLLevel6),
                         (vi.DLLevel7),
                         (vi.DLLevel8),
                         (vi.DLLevel9) ) v(Code)
    JOIN   FIN3.DL dlBank ON dlBank.Code = v.Code
    WHERE  N.IsTotal    = 0
      AND  vi.VoucherRef = N.VoucherID
      AND  vi.SLCode     = 1001
      AND  v.Code IS NOT NULL
) BankAgg
WHERE (@BankTitleFilter IS NULL OR ISNULL(BankAgg.BankTitle , N.DebtDesc) LIKE '%' + @BankTitleFilter + '%') -- 🆕 اضافه شدن فیلتر برای بانک عامل
ORDER BY
    N.IsTotal         ASC ,
    N.DueDate_Persian ASC ,
    N.ContractID      ASC;
