;WITH LifetimeBalance AS
(
    SELECT
        vi.DLLevel5 ,
        SUM(ISNULL(vi.Debit,0) - ISNULL(vi.Credit,0)) AS NetBalance
    FROM   FIN3.VoucherItem vi
    JOIN   FIN3.Voucher     v  ON v.VoucherID = vi.VoucherRef
    WHERE  vi.DLLevel5 IS NOT NULL
      AND  vi.DLLevel4 = N'25767'
      AND  vi.SLRef    = 35
      AND ((v.VoucherTypeRef IN (1,2,3,4,8,10,12,13,14,15,16,17,18,19,20,21)
             AND v.FiscalYearRef IN (2,4,5,6,7,8,12))
            OR (v.VoucherTypeRef IN (6,11) AND v.FiscalYearRef = 2))
      AND  v.LedgerRef   = 1
      AND  v.IsTemporary = 0
      AND  v.State      <> 2
    GROUP BY vi.DLLevel5
),
L5 AS
(
    SELECT
        ROW_NUMBER() OVER (ORDER BY dl.Code)                              AS RowID ,
        dl.Code ,
        dl.Title ,
        REPLACE(
          REPLACE(
            REPLACE(
              REPLACE(dl.Title, N'ش حساب', N'ش حساب '),
              N'ش برگ', N' ش برگ'),
            N'ریال', N' ریال '),
          N'-', N' ')                                                     AS CleanTitle ,
        SUM(CASE WHEN s.Balance > 0 THEN  s.Balance ELSE 0 END)          AS DebitBalance ,
        SUM(CASE WHEN s.Balance < 0 THEN -s.Balance ELSE 0 END)          AS CreditBalance
    FROM (
        SELECT
            vi.DLLevel5 ,
            ISNULL(vi.Debit,0) - ISNULL(vi.Credit,0)                     AS Balance
        FROM   FIN3.VoucherItem vi
        JOIN   FIN3.Voucher     v  ON v.VoucherID = vi.VoucherRef
        WHERE  vi.DLLevel5 IS NOT NULL
          AND  vi.DLLevel4 = N'25767'
          AND  vi.SLRef    = 35
          AND  v.Date BETWEEN @STARTDATE AND @ENDDATE
          AND ((v.VoucherTypeRef IN (1,2,3,4,8,10,12,13,14,15,16,17,18,19,20,21)
                 AND v.FiscalYearRef = 8)
                OR (v.VoucherTypeRef IN (6,11) AND v.FiscalYearRef = 8))
          AND  v.LedgerRef   = 1
          AND  v.IsTemporary = 0
          AND  v.State      <> 2
    ) s
    JOIN FIN3.DL dl ON dl.Code = s.DLLevel5
    GROUP BY dl.Code , dl.Title
),
Tokens AS
(
    SELECT
        l.RowID ,
        l.Code ,
        l.Title ,
        l.DebitBalance ,
        l.CreditBalance ,
        value     AS Token ,
        [ordinal] AS Pos
    FROM   L5 l
    CROSS  APPLY STRING_SPLIT(l.CleanTitle, N' ', 1)
),
Rate AS
(
    SELECT DISTINCT
        t1.RowID ,
        REPLACE(t0.Token, N'/', N'.') + N'%'                             AS RateText
    FROM   Tokens t1
    JOIN   Tokens t0 ON t0.RowID = t1.RowID AND t0.Pos = t1.Pos - 1
    WHERE  t1.Token = N'درصد'
      AND  TRY_CONVERT(decimal(4,2), REPLACE(t0.Token, N'/', N'.')) IS NOT NULL
    UNION ALL
    SELECT DISTINCT
        RowID ,
        REPLACE(LEFT(Token, CHARINDEX(N'درصد', Token) - 1), N'/', N'.') + N'%'
                                                                         AS RateText
    FROM   Tokens
    WHERE  Token LIKE N'%درصد'
      AND  TRY_CONVERT(decimal(4,2),
               REPLACE(LEFT(Token, CHARINDEX(N'درصد', Token) - 1), N'/', N'.')) IS NOT NULL
),
Due AS
(
    SELECT RowID ,
        CASE
            WHEN LEN(DateTok) = 8 THEN '14' + DateTok
            WHEN LEN(DateTok) = 9 THEN '1'  + DateTok
            ELSE DateTok
        END                                                              AS DueRaw
    FROM (
        SELECT RowID , DateTok ,
            ROW_NUMBER() OVER (PARTITION BY RowID ORDER BY Pos DESC)     AS rn
        FROM (
            SELECT RowID , Pos ,
                REPLACE(Token, N'سررسید', N'')                           AS DateTok
            FROM   Tokens
            WHERE  Token LIKE N'%/%'
              AND  TRY_CONVERT(date, REPLACE(Token, N'سررسید', N''), 111) IS NOT NULL
        ) d
    ) x
    WHERE rn = 1
),
BankStatus AS
(
    SELECT
        CASE
            WHEN SUM(CASE WHEN ABS(ISNULL(lb.NetBalance, 0)) >= 1 THEN 1 ELSE 0 END) > 0
                THEN N'فعال'
            ELSE N'غیرفعال'
        END AS BankStatusText
    FROM   L5 l
    LEFT JOIN LifetimeBalance lb ON lb.DLLevel5 = l.Code
),
FinalData AS
(
    SELECT
        l.RowID ,
        l.Code ,
        l.Title ,
        l.DebitBalance ,
        l.CreditBalance ,
        lb.NetBalance ,
        r.RateText ,
        d.DueRaw ,
        bs.BankStatusText ,
        N'ملت'                                                            AS BankName ,
        CASE
            WHEN ABS(ISNULL(lb.NetBalance, 0)) < 1 THEN N'بسته شده'
            ELSE N'فعال'
        END                                                              AS RowStatus ,
        (SELECT MIN(CASE WHEN t.Token LIKE N'%/%'
                           AND TRY_CONVERT(date, REPLACE(t.Token, N'سررسید', N''), 111) IS NULL
                          THEN t.Token END)
         FROM Tokens t WHERE t.RowID = l.RowID)                          AS OpeningNumber ,
        (SELECT TOP 1 t.Token
         FROM Tokens t
         WHERE t.RowID = l.RowID
           AND t.Token NOT LIKE N'%/%'
           AND t.Token NOT LIKE N'%[^0-9]%'
           AND LEN(t.Token) BETWEEN 9 AND 12
         ORDER BY LEN(t.Token) DESC, t.Pos ASC)                          AS DepositNumber
    FROM        L5              l
    LEFT JOIN   LifetimeBalance lb  ON lb.DLLevel5   = l.Code
    LEFT JOIN   Rate            r   ON r.RowID       = l.RowID
    LEFT JOIN   Due             d   ON d.RowID       = l.RowID
    CROSS JOIN  BankStatus      bs
),
Filtered AS
(
    SELECT *,
        ROW_NUMBER() OVER (ORDER BY Code) AS RowNumber
    FROM   FinalData
    WHERE  (NULLIF(@StatusFilter, N'') IS NULL
              OR RowStatus LIKE N'%' + LTRIM(RTRIM(@StatusFilter)) + N'%')
      AND  (NULLIF(@RateFilter,   N'') IS NULL
              OR RateText  LIKE N'%' + LTRIM(RTRIM(@RateFilter))   + N'%')
      AND  (NULLIF(@BankFilter,   N'') IS NULL
              OR BankName  LIKE N'%' + LTRIM(RTRIM(@BankFilter))   + N'%')
)
SELECT
    fd.RowNumber                                                         AS [ردیف] ,
    fd.BankName                                                          AS [نام بانک] ,
    fd.BankStatusText                                                    AS [وضعیت بانک] ,
    N'سپرده (شرکت)'                                                      AS [حساب] ,
    NULL                                                                 AS [نام تامین کننده] ,
    fd.OpeningNumber                                                     AS [شماره گشایش] ,
    fd.DepositNumber                                                     AS [شماره سپرده] ,
    FORMAT(IIF(fd.DebitBalance > 0, fd.DebitBalance, fd.CreditBalance),
           N'N0')                                                        AS [سپرده] ,
    fd.RateText                                                          AS [نرخ سود سپرده] ,
    fd.DueRaw                                                            AS [تاریخ سر رسید سپرده] ,
    CASE WHEN fd.DueRaw IS NULL THEN NULL
         ELSE CONVERT(char(10),
                      DATEADD(year, -3,
                              TRY_CONVERT(date, fd.DueRaw, 111)), 111)
    END                                                                  AS [تاریخ افتتاح سپرده] ,
    fd.RowStatus                                                         AS [وضعیت] ,
    fd.CreditBalance                                                     AS [بستانکار] ,
    fd.DebitBalance                                                      AS [بدهکار] ,
    ISNULL(fd.NetBalance, 0)                                             AS [مانده کل تاریخچه] ,
    fd.Title                                                             AS [شرح]
FROM Filtered fd
ORDER BY fd.RowNumber;
