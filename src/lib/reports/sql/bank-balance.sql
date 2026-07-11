-- [bound by Insight Portal] DECLARE @LedgerRef BIGINT = 1
-- [bound by Insight Portal] DECLARE @BranchRef BIGINT = 1
-- [bound by Insight Portal] DECLARE @StartDate DATETIME = '2024-03-20 00:00:00'
-- [bound by Insight Portal] DECLARE @EndDate DATETIME = '2026-05-06 00:00:00'
-- [bound by Insight Portal] DECLARE @TopCount INT = 1000000
-- [bound by Insight Portal] DECLARE @BankName NVARCHAR(100) = NULL

SELECT * FROM (
    SELECT TOP (@TopCount)
        ba.BankAccountID AS ID,
        ba.Number AS BankAccountNumber,
        b.Name AS BankName,
        bb.Name AS BankBranchName,
        c.Title AS CurrencyTitle,
        
        FORMAT(SUM(CASE 
            WHEN bat.DocumentDate < @StartDate 
                OR (bat.IsDeployment = 1 AND bat.DocumentDate BETWEEN @StartDate AND @EndDate)
            THEN bat.Debit - bat.Credit
            ELSE 0
        END), 'N0') AS BeginingBalance,
        
        FORMAT(SUM(CASE 
            WHEN bat.DocumentDate BETWEEN @StartDate AND @EndDate 
                AND ISNULL(bat.IsDeployment, 0) = 0
            THEN bat.Debit
            ELSE 0
        END), 'N0') AS TotalDebit,
        
        FORMAT(SUM(CASE 
            WHEN bat.DocumentDate BETWEEN @StartDate AND @EndDate 
                AND ISNULL(bat.IsDeployment, 0) = 0
            THEN bat.Credit
            ELSE 0
        END), 'N0') AS TotalCredit,
        
        FORMAT(SUM(CASE 
            WHEN bat.DocumentDate <= @EndDate
            THEN bat.Debit - bat.Credit
            ELSE 0
        END), 'N0') AS EndingBalance,
        
        FORMAT(ISNULL((
            SELECT SUM(rn.Amount)
            FROM RPA3.BankTransferReceivableNote btrn
            INNER JOIN RPA3.BankTransfer bt ON btrn.BankTransferRef = bt.BankTransferID
            INNER JOIN RPA3.ReceivableNote rn ON btrn.ReceivableNoteRef = rn.ReceivableNoteID
            INNER JOIN RPA3.ReceivableNoteTransaction rnt ON btrn.ReceivableNoteTransactionRef = rnt.ReceivableNoteTransactionID
            INNER JOIN RPA3.ReceiptReceivableNote rrn ON rn.ReceivableNoteID = rrn.ReceivableNoteRef
            INNER JOIN RPA3.Receipt r ON rrn.ReceiptRef = r.ReceiptID
            WHERE bt.BankAccountRef = ba.BankAccountID
                AND rnt.DocumentDate BETWEEN @StartDate AND @EndDate
                AND rnt.State = 2
                AND rnt.BranchRef = @BranchRef
                AND rnt.LedgerRef = @LedgerRef
                AND r.ApproveState <> 4
                AND rn.LedgerRef = @LedgerRef
        ), 0), 'N0') AS TotalBankTransfer,
        
        FORMAT(ISNULL((
            SELECT SUM(pn.Amount)
            FROM RPA3.PayableNote pn
            INNER JOIN RPA3.PayableNoteTransaction pnt ON pn.PayableNoteID = pnt.PayableNoteRef
            WHERE pn.BankAccountRef = ba.BankAccountID
                AND pnt.DocumentDate BETWEEN @StartDate AND @EndDate
                AND pnt.State = 11
                AND pnt.DurationType = 2
                AND pnt.BranchRef = @BranchRef
                AND pnt.LedgerRef = @LedgerRef
                AND pn.LedgerRef = @LedgerRef
        ), 0), 'N0') AS TotalShortTermDurationPaid,
        
        FORMAT(ISNULL((
            SELECT SUM(pn.Amount)
            FROM RPA3.PayableNote pn
            INNER JOIN RPA3.PayableNoteTransaction pnt ON pn.PayableNoteID = pnt.PayableNoteRef
            WHERE pn.BankAccountRef = ba.BankAccountID
                AND pnt.DocumentDate BETWEEN @StartDate AND @EndDate
                AND pnt.State = 11
                AND pnt.DurationType = 3
                AND pnt.BranchRef = @BranchRef
                AND pnt.LedgerRef = @LedgerRef
                AND pn.LedgerRef = @LedgerRef
        ), 0), 'N0') AS TotalLongTermDurationPaid,
        
        FORMAT(ISNULL((
            SELECT SUM(pn.Amount)
            FROM RPA3.PayableNote pn
            INNER JOIN RPA3.PayableNoteTransaction pnt ON pn.PayableNoteID = pnt.PayableNoteRef
            WHERE pn.BankAccountRef = ba.BankAccountID
                AND pnt.DocumentDate BETWEEN @StartDate AND @EndDate
                AND pnt.State = 11
                AND pnt.NormalORGuarantee = 2
                AND pnt.BranchRef = @BranchRef
                AND pnt.LedgerRef = @LedgerRef
                AND pn.LedgerRef = @LedgerRef
        ), 0), 'N0') AS TotalGuaranteePaid,
        
        FORMAT(ISNULL((
            SELECT SUM(pn.Amount)
            FROM RPA3.PayableNote pn
            INNER JOIN RPA3.PayableNoteTransaction pnt ON pn.PayableNoteID = pnt.PayableNoteRef
            WHERE pn.BankAccountRef = ba.BankAccountID
                AND pnt.DocumentDate BETWEEN @StartDate AND @EndDate
                AND pnt.State IN (-11, -28)
                AND pnt.BranchRef = @BranchRef
                AND pnt.LedgerRef = @LedgerRef
                AND pn.LedgerRef = @LedgerRef
        ), 0), 'N0') AS TotalPrePaid,
        
        ISNULL(parentBank.Name + '/' + parentBranch.Name + '/' + parentAccount.Number, '') AS BackupBankAccount,
        
        ba.CurrencyRef,
        0 AS IsSummaryRow

    FROM RPA3.BankAccount ba
    INNER JOIN RPA3.BankBranch bb ON ba.BankBranchRef = bb.BankBranchID
    INNER JOIN RPA3.Bank b ON bb.BankRef = b.BankID
    INNER JOIN GNR3.Currency c ON ba.CurrencyRef = c.CurrencyID
    LEFT JOIN RPA3.BankAccountTransaction bat ON ba.BankAccountID = bat.BankAccountRef
        AND bat.BranchRef = @BranchRef
        AND bat.LedgerRef = @LedgerRef
    LEFT JOIN RPA3.BankAccount parentAccount ON ba.ParentRef = parentAccount.BankAccountID
    LEFT JOIN RPA3.BankBranch parentBranch ON parentAccount.BankBranchRef = parentBranch.BankBranchID
    LEFT JOIN RPA3.Bank parentBank ON parentBranch.BankRef = parentBank.BankID

    WHERE ba.LedgerRef = @LedgerRef
        AND (@BankName IS NULL OR b.Name LIKE N'%' + @BankName + '%')

    GROUP BY 
        ba.BankAccountID,
        ba.Number,
        b.Name,
        bb.Name,
        c.Title,
        ba.CurrencyRef,
        parentBank.Name,
        parentBranch.Name,
        parentAccount.Number

    HAVING 
        SUM(CASE WHEN bat.DocumentDate < @StartDate OR (bat.IsDeployment = 1 AND bat.DocumentDate BETWEEN @StartDate AND @EndDate) THEN bat.Debit - bat.Credit ELSE 0 END) <> 0
        OR SUM(CASE WHEN bat.DocumentDate BETWEEN @StartDate AND @EndDate AND ISNULL(bat.IsDeployment, 0) = 0 THEN bat.Debit ELSE 0 END) <> 0
        OR SUM(CASE WHEN bat.DocumentDate BETWEEN @StartDate AND @EndDate AND ISNULL(bat.IsDeployment, 0) = 0 THEN bat.Credit ELSE 0 END) <> 0
        OR SUM(CASE WHEN bat.DocumentDate <= @EndDate THEN bat.Debit - bat.Credit ELSE 0 END) <> 0

    ORDER BY b.Name, bb.Name, ba.Number
) MainData

UNION ALL

SELECT 
    NULL AS ID,
    N'جمع کل' AS BankAccountNumber,
    NULL AS BankName,
    NULL AS BankBranchName,
    NULL AS CurrencyTitle,
    
    FORMAT(SUM(CASE 
        WHEN bat.DocumentDate < @StartDate 
            OR (bat.IsDeployment = 1 AND bat.DocumentDate BETWEEN @StartDate AND @EndDate)
        THEN bat.Debit - bat.Credit
        ELSE 0
    END), 'N0') AS BeginingBalance,
    
    FORMAT(SUM(CASE 
        WHEN bat.DocumentDate BETWEEN @StartDate AND @EndDate 
            AND ISNULL(bat.IsDeployment, 0) = 0
        THEN bat.Debit
        ELSE 0
    END), 'N0') AS TotalDebit,
    
    FORMAT(SUM(CASE 
        WHEN bat.DocumentDate BETWEEN @StartDate AND @EndDate 
            AND ISNULL(bat.IsDeployment, 0) = 0
        THEN bat.Credit
        ELSE 0
    END), 'N0') AS TotalCredit,
    
    FORMAT(SUM(CASE 
        WHEN bat.DocumentDate <= @EndDate
        THEN bat.Debit - bat.Credit
        ELSE 0
    END), 'N0') AS EndingBalance,
    
    NULL AS TotalBankTransfer,
    NULL AS TotalShortTermDurationPaid,
    NULL AS TotalLongTermDurationPaid,
    NULL AS TotalGuaranteePaid,
    NULL AS TotalPrePaid,
    NULL AS BackupBankAccount,
    NULL AS CurrencyRef,
    1 AS IsSummaryRow

FROM RPA3.BankAccount ba
INNER JOIN RPA3.BankBranch bb ON ba.BankBranchRef = bb.BankBranchID
INNER JOIN RPA3.Bank b ON bb.BankRef = b.BankID
LEFT JOIN RPA3.BankAccountTransaction bat ON ba.BankAccountID = bat.BankAccountRef
    AND bat.BranchRef = @BranchRef
    AND bat.LedgerRef = @LedgerRef

WHERE ba.LedgerRef = @LedgerRef
    AND (@BankName IS NULL OR b.Name LIKE N'%' + @BankName + '%')
