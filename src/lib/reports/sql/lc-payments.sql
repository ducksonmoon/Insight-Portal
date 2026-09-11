-- پرداخت‌ها و انتقال‌های هر اعتبار — یک سطر به ازای هر سند پرداخت
--
-- The other two LC reports are built from the *credit* side of SL 3009: the
-- supplier documents that create the obligation. This one is the debit side —
-- the money actually paid out against each credit, with the voucher it was
-- paid on, so "what has been paid on this LC, when, and on which document"
-- can be answered without opening Rahkaran.
--
-- The settlement pipeline consumes these rows into a single AllocatedDebit per
-- invoice line and never shows them individually, which is why they were
-- invisible in the product until now.
--
-- Only the account/title lookups are included, not lc-core.sql: nothing here
-- needs FIFO settlement, and skipping it is the difference between about a
-- second and twenty.
--
-- Parameters: @dl4 @dl5 @OrderNumber
--
-- Deliberately ignores @STARTDATE/@ENDDATE. Those filter the credit side's
-- تاریخ سررسید, and a payment has no due date of its own — applying that
-- window here would silently hide part of an LC's payment history precisely
-- when someone is trying to reconcile it. Narrowing to one credit is what
-- شماره سفارش is for.

-- @include lc-accounts.sql

SELECT
    ROW_NUMBER() OVER (ORDER BY vh.Date DESC, vi.VoucherItemID DESC) AS [ردیف],
    SYS3.fn_DateToShamsiDate(vh.Date)          AS [تاریخ پرداخت],
    vh.Number                                  AS [شماره سند],
    vt.Title                                   AS [نوع سند],
    ltp.ExtractedLCNumber                      AS [شماره گشایش],
    ltp.ExtractedOrderNumber                   AS [شماره سفارش],
    LTRIM(RTRIM(REPLACE(dl5.Title, N'-بانک گشایش کننده', N''))) AS [بانک عامل],
    dl4.Title                                  AS [ذی‌نفع],
    CAST(vi.Debit AS DECIMAL(38, 0))           AS [مبلغ پرداخت],
    vi.Description                             AS [شرح سند],
    vi.FollowUpNumber                          AS [شماره پیگیری],
    dl6.Title                                  AS [شرح تفصیل اعتبار]
FROM fin3.VoucherItem vi
INNER JOIN fin3.Voucher vh   ON vh.VoucherID = vi.VoucherRef
INNER JOIN fin3.DL      dl6  ON dl6.Code = vi.DLLevel6 AND dl6.DLTypeRef = vi.DLTypeRef6
INNER JOIN fin3.DL      dl5  ON dl5.Code = vi.DLLevel5 AND dl5.DLTypeRef = vi.DLTypeRef5
INNER JOIN fin3.DL      dl4  ON dl4.Code = vi.DLLevel4 AND dl4.DLTypeRef = vi.DLTypeRef4
INNER JOIN #LcTitle     ltp  ON ltp.Code = vi.DLLevel6 AND ltp.DLTypeRef = vi.DLTypeRef6
LEFT  JOIN fin3.VoucherType vt ON vt.VoucherTypeID = vh.VoucherTypeRef
-- Same hygiene filters the credit side uses: posted, not reversed, main ledger.
INNER JOIN SYS3.Lookup  lp1  ON lp1.Code = vi.DLLevel5 AND lp1.Type = N'BankG'
WHERE vi.SLCode = N'3009'
  AND ISNULL(vi.Debit, 0) > 0
  AND vh.IsTemporary = 0
  AND vh.State <> 2
  AND vh.VoucherTypeRef IN (1,2,3,4,8,10,12,13,14,15,16,17,18,19,20,21)
  AND vh.LedgerRef = 1
  AND (dl4.Title = @dl4 OR @dl4 IS NULL)
  AND (lp1.Code = @dl5 OR @dl5 IS NULL)
  AND (ltp.ExtractedOrderNumber = LTRIM(RTRIM(@OrderNumber))
       OR @OrderNumber IS NULL OR LTRIM(RTRIM(@OrderNumber)) = N'')
ORDER BY vh.Date DESC, vi.VoucherItemID DESC;
