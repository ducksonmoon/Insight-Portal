-- گزارش خرید مواد اولیه — واحد بازرگانی (جناب فهیمی، Creator=34)

-- [bound by Insight Portal] DECLARE @aztarikh DATE = NULL;

-- [bound by Insight Portal] DECLARE @tatarikh DATE = NULL;

-- [bound by Insight Portal] DECLARE @supplierid BIGINT = NULL;   -- Rahkaran selector: PRC3.Supplier

-- [bound by Insight Portal] DECLARE @partname NVARCHAR(200) = NULL;  -- partial match on نام کالا



;WITH ReceiptByOrderItem AS (

    SELECT oi.OrderItemID,

        SUM(

            ISNULL(CASE WHEN vi.InventoryVoucherItemID IS NOT NULL THEN

                CASE

                    WHEN eg.Code = '107' AND vi.InventoryVoucherSpecificationRef IN (2, 3, 10019, 22, 10045) THEN vi.MajorUnitQuantity

                    WHEN eg.Code IN ('103') AND vi.InventoryVoucherSpecificationRef IN (2, 3, 10066, 10069, 22, 10045) THEN vi.MajorUnitQuantity

                    WHEN vi.InventoryVoucherSpecificationRef IN (2, 3, 22, 10045, 10069, 10066, 10019) THEN vi.MajorUnitQuantity

                    ELSE 0

                END

            END, 0)

            + ISNULL(CASE WHEN vi2.InventoryVoucherItemID IS NOT NULL THEN

                CASE

                    WHEN eg.Code = '107' AND vi2.InventoryVoucherSpecificationRef IN (2, 3, 10019, 22, 10045) THEN vi2.MajorUnitQuantity

                    WHEN eg.Code IN ('103') AND vi2.InventoryVoucherSpecificationRef IN (2, 3, 10066, 10069, 22, 10045) THEN vi2.MajorUnitQuantity

                    WHEN vi2.InventoryVoucherSpecificationRef IN (2, 3, 22, 10045, 10069, 10066, 10019) THEN vi2.MajorUnitQuantity

                    ELSE 0

                END

            END, 0)

        ) AS ReceivedQty

    FROM PRC3.OrderItem oi

    INNER JOIN PRC3.PurchaseItem pui ON pui.PurchaseItemID = oi.PurchaseItemRef AND pui.[Type] = 1

    LEFT JOIN LGS3.PartGroupMember pgm ON pgm.MemberID = pui.PartRef AND pgm.GroupingRef = 184

    LEFT JOIN GNR3.EntityGroup eg ON eg.EntityGroupID = pgm.GroupRef

    LEFT JOIN PRC3.DeliveryItem dlit ON dlit.ReferenceRef = oi.OrderItemID

    LEFT JOIN PRC3.InvoiceItem ii ON ii.ReferenceRef = oi.OrderItemID

    LEFT JOIN PRC3.DeliveryItem dlitF ON dlitF.ReferenceRef = ii.InvoiceItemID

    LEFT JOIN LGS3.ReceiptPermitItem ri ON ri.ReferenceRef = dlit.DeliveryItemID AND ri.ReferenceType = 4

    LEFT JOIN LGS3.ReceiptPermitItem ri2 ON ri2.ReferenceRef = dlitF.DeliveryItemID AND ri2.ReferenceType = 4

    LEFT JOIN LGS3.InventoryVoucherItem vi ON vi.ReferenceRef = ri.ReceiptPermitItemID AND vi.ReferenceType = 2

    LEFT JOIN LGS3.InventoryVoucherItem vi2 ON vi2.ReferenceRef = ri2.ReceiptPermitItemID AND vi2.ReferenceType = 2

    GROUP BY oi.OrderItemID

),

OrderLines AS (

    SELECT

        ord.OrderDate,

        ord.Number AS OrderNumber,

        pa.Name AS PartName,

        oi.MajorUnitQuantity,

        ISNULL(rb.ReceivedQty, 0) AS ReceivedQty,

        CASE

            WHEN p.FullName LIKE N'%سفارش خارج%' THEN N'سفارش خارجی ورق از چین'

            WHEN CHARINDEX(N' سفارش ', ISNULL(p.FullName, N'')) > 0

                THEN LTRIM(RTRIM(LEFT(p.FullName, CHARINDEX(N' سفارش ', p.FullName) - 1)))

            ELSE ISNULL(NULLIF(LTRIM(RTRIM(p.FullName)), N''), N'نامشخص')

        END AS SupplierName

    FROM PRC3.[Order] ord

    INNER JOIN PRC3.OrderItem oi ON oi.OrderRef = ord.OrderID

    INNER JOIN PRC3.PurchaseItem pui ON pui.PurchaseItemID = oi.PurchaseItemRef AND pui.[Type] = 1

    INNER JOIN LGS3.Part pa ON pa.PartID = pui.PartRef

    LEFT JOIN PRC3.Supplier su ON su.SupplierID = ord.SupplierRef

    LEFT JOIN GNR3.Party p ON p.PartyID = su.PartyRef

    LEFT JOIN ReceiptByOrderItem rb ON rb.OrderItemID = oi.OrderItemID

    WHERE ord.Creator = 34

      AND (@aztarikh IS NULL OR @tatarikh IS NULL OR ord.OrderDate BETWEEN @aztarikh AND @tatarikh)

      AND (@supplierid IS NULL OR ord.SupplierRef = @supplierid)

      AND (

          @partname IS NULL OR LTRIM(RTRIM(@partname)) = N''

          OR pa.Name COLLATE Persian_100_CI_AI LIKE N'%' + LTRIM(RTRIM(@partname)) + N'%'

      )

)

SELECT

    SupplierName AS [تامین کننده],

    [SYS3].[fn_DateToShamsiDate](OrderDate) AS [تاریخ سفارش خرید],

    OrderNumber AS [سفارش خرید],

    PartName AS [نام کالا],

    CAST(SUM(ISNULL(MajorUnitQuantity, 0)) AS DECIMAL(18, 3)) AS [مقدار سفارش],

    CAST(SUM(ReceivedQty) AS DECIMAL(18, 3)) AS [مقدار رسید شده],

    CAST(SUM(ISNULL(MajorUnitQuantity, 0)) - SUM(ReceivedQty) AS DECIMAL(18, 3)) AS [مانده سفارش]

FROM OrderLines

GROUP BY SupplierName, OrderDate, OrderNumber, PartName

HAVING SUM(ISNULL(MajorUnitQuantity, 0)) > 0

ORDER BY OrderDate DESC, [تامین کننده], [سفارش خرید], [نام کالا];
