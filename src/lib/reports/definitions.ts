import type { ReportDefinition } from "@/types/report";
import { normalizeDefinition } from "@/types/report";

/** Shared between the lc-summary report's top-level mirror and its `main` dataset. */
const LC_SUMMARY_COLUMNS = [
      { field: "ردیف", header: "ردیف", type: "number" as const, width: 64, pinned: "right" as const },
      { field: "وضعیت", header: "وضعیت", type: "string" as const, width: 120, pinned: "right" as const },
      { field: "اولویت وضعیت", header: "اولویت وضعیت", type: "number" as const, width: 90, hidden: true },
      { field: "شماره گشایش", header: "شماره گشایش", type: "string" as const, width: 210 },
      { field: "شماره سفارش", header: "شماره سفارش", type: "string" as const, width: 120 },
      { field: "بانک عامل", header: "بانک عامل", type: "string" as const, width: 190 },
      { field: "ذی‌نفع", header: "ذی‌نفع", type: "string" as const, width: 200 },
      { field: "مهلت (روز)", header: "مهلت (روز)", type: "number" as const, width: 90 },
      { field: "تاریخ گشایش", header: "تاریخ گشایش", type: "string" as const, width: 110 },
      { field: "مبلغ گشایش", header: "مبلغ گشایش", type: "number" as const, format: "#,##0", width: 150 },
      { field: "جمع اسناد واصله", header: "جمع اسناد واصله", type: "number" as const, format: "#,##0", width: 150 },
      { field: "درصد مصرف اعتبار", header: "٪ مصرف اعتبار", type: "number" as const, format: "#,##0.00", width: 110 },
      { field: "مانده اعتبار استفاده‌نشده", header: "مانده اعتبار استفاده‌نشده", type: "number" as const, format: "#,##0", width: 160, hidden: true },
      { field: "تعداد فاکتور", header: "تعداد فاکتور", type: "number" as const, width: 100 },
      { field: "پیش/میان دریافت", header: "پیش/میان دریافت", type: "number" as const, format: "#,##0", width: 150, hidden: true },
      { field: "خالص قابل پرداخت", header: "خالص قابل پرداخت", type: "number" as const, format: "#,##0", width: 150, hidden: true },
      { field: "پرداخت‌شده", header: "پرداخت‌شده", type: "number" as const, format: "#,##0", width: 150 },
      { field: "مانده بدهی", header: "مانده بدهی", type: "number" as const, format: "#,##0", width: 150 },
      { field: "مازاد پرداخت", header: "مازاد پرداخت", type: "number" as const, format: "#,##0", width: 140, hidden: true },
      { field: "نزدیک‌ترین سررسید باز", header: "نزدیک‌ترین سررسید", type: "string" as const, width: 130 },
      { field: "روز تا سررسید", header: "روز تا سررسید", type: "number" as const, width: 110 },
      { field: "مبلغ معوق", header: "مبلغ معوق", type: "number" as const, format: "#,##0", width: 150 },
      { field: "قدمت معوق (روز)", header: "قدمت معوق (روز)", type: "number" as const, width: 120 },
      { field: "سررسید امروز", header: "سررسید امروز", type: "number" as const, format: "#,##0", width: 140, hidden: true },
      { field: "سررسید نزدیک", header: "سررسید نزدیک", type: "number" as const, format: "#,##0", width: 140, hidden: true },
      { field: "سررسید ۳۰ روز", header: "سررسید ۳۰ روز", type: "number" as const, format: "#,##0", width: 140, hidden: true },
      { field: "معوق ۱-۳۰", header: "معوق ۱-۳۰", type: "number" as const, format: "#,##0", width: 130, hidden: true },
      { field: "معوق ۳۱-۶۰", header: "معوق ۳۱-۶۰", type: "number" as const, format: "#,##0", width: 130, hidden: true },
      { field: "معوق ۶۱-۹۰", header: "معوق ۶۱-۹۰", type: "number" as const, format: "#,##0", width: 130, hidden: true },
      { field: "معوق بالای ۹۰", header: "معوق بالای ۹۰", type: "number" as const, format: "#,##0", width: 140, hidden: true },
      { field: "اولین فاکتور", header: "اولین فاکتور", type: "string" as const, width: 110, hidden: true },
      { field: "آخرین فاکتور", header: "آخرین فاکتور", type: "string" as const, width: 110, hidden: true },
      { field: "هشدار", header: "هشدار", type: "string" as const, width: 220 },
      { field: "شرح تفصیل اعتبار", header: "شرح تفصیل اعتبار", type: "string" as const, width: 320, hidden: true },
    ];

const LC_SUMMARY_CHARTS = [
      { type: "pie" as const, title: "تعداد اعتبار به تفکیک وضعیت", xField: "وضعیت", yField: "تعداد فاکتور" },
      { type: "bar" as const, title: "مانده بدهی به تفکیک بانک عامل", xField: "بانک عامل", yField: "مانده بدهی" },
      { type: "bar" as const, title: "مبلغ معوق به تفکیک ذی‌نفع", xField: "ذی‌نفع", yField: "مبلغ معوق" },
    ];

const rawDefinitions = [
  {
    // The management view: one row per اعتبار, which is the grain this
    // customer reviews by. The invoice-line detail lives in "lc-report".
    id: "lc-summary",
    nameFa: "گزارش ال سی — سطح اعتبار (گشایش × سفارش)",
    moduleId: "financial",
    dataSourceId: "rahkaran",
    sqlFile: "lc-summary.sql",
    parameters: [
      { name: "STARTDATE", label: "از تاریخ سررسید", type: "jalali-date" as const, nullable: true },
      { name: "ENDDATE", label: "تا تاریخ سررسید", type: "jalali-date" as const, nullable: true },
      { name: "dl4", label: "ذی‌نفع (طرف بستانکار)", type: "lookup" as const, nullable: true, lookupCatalogSlug: "dl-titles" },
      { name: "dl5", label: "بانک عامل", type: "lookup" as const, nullable: true, lookupCatalogSlug: "bank-g" },
      { name: "OrderNumber", label: "شماره سفارش", type: "text" as const, nullable: true },
      {
        name: "DebtStatus",
        label: "وضعیت",
        type: "select" as const,
        nullable: true,
        options: [
          { value: "معوق", label: "معوق — سررسید گذشته" },
          { value: "سررسید امروز", label: "سررسید امروز" },
          { value: "نزدیک سررسید", label: "نزدیک سررسید" },
          { value: "جاری", label: "جاری — باز و در موعد" },
          { value: "مازاد پرداخت", label: "مازاد پرداخت" },
          { value: "تسویه شده", label: "تسویه شده" },
        ],
      },
      {
        name: "HorizonDays",
        label: "افق هشدار «نزدیک سررسید» (روز)",
        type: "number" as const,
        nullable: true,
      },
    ],
    // Visible by default: the identity of the credit, what it is worth, and
    // when it is due. Everything else is one click away in the column panel —
    // a 33-column wall is what made the previous report unreviewable.
    columns: LC_SUMMARY_COLUMNS,
    charts: LC_SUMMARY_CHARTS,
    // Second section: the debit side. The other LC reports are built from the
    // credit side (the supplier documents that create the obligation) and the
    // settlement collapses payments into one AllocatedDebit per line, so the
    // individual payments were invisible in the product. Narrow with
    // شماره سفارش to reconcile a single credit.
    datasets: [
      {
        id: "main",
        nameFa: "اعتبارات — گشایش × سفارش",
        sqlSource: { mode: "file" as const, path: "lc-summary.sql" },
        columns: LC_SUMMARY_COLUMNS,
        charts: LC_SUMMARY_CHARTS,
        gridConfig: { density: "compact" as const, pageSize: 100 },
      },
      {
        id: "payments",
        nameFa: "پرداخت‌ها و انتقال‌های اعتبار",
        sqlSource: { mode: "file" as const, path: "lc-payments.sql" },
        // Declared as a child of "main" on the real key, which also makes the
        // engine run it *after* the parent instead of in parallel. That is
        // deliberate here: root datasets run concurrently and therefore need a
        // second pooled connection, and on this customer's network a fresh
        // handshake to the named instance fails far more often than it
        // succeeds (see the pool comments in src/lib/db/rahkaran.ts). Measured:
        // parallel returned "Failed to connect … in 15000ms" where serial,
        // reusing the warm connection, completes in ~33s. Reliable and slower
        // beats faster and intermittently broken.
        parentDatasetId: "main",
        parentKeyFields: ["شماره گشایش", "شماره سفارش"],
        childKeyFields: ["شماره گشایش", "شماره سفارش"],
        columns: [
          { field: "ردیف", header: "ردیف", type: "number" as const, width: 64 },
          { field: "تاریخ پرداخت", header: "تاریخ پرداخت", type: "string" as const, width: 110 },
          { field: "شماره سند", header: "شماره سند", type: "number" as const, width: 100 },
          { field: "نوع سند", header: "نوع سند", type: "string" as const, width: 150 },
          { field: "شماره گشایش", header: "شماره گشایش", type: "string" as const, width: 210 },
          { field: "شماره سفارش", header: "شماره سفارش", type: "string" as const, width: 120 },
          { field: "بانک عامل", header: "بانک عامل", type: "string" as const, width: 190 },
          { field: "ذی‌نفع", header: "ذی‌نفع", type: "string" as const, width: 200 },
          { field: "مبلغ پرداخت", header: "مبلغ پرداخت", type: "number" as const, format: "#,##0", width: 160 },
          { field: "شرح سند", header: "شرح سند", type: "string" as const, width: 340 },
          { field: "شماره پیگیری", header: "شماره پیگیری", type: "string" as const, width: 130, hidden: true },
          { field: "شرح تفصیل اعتبار", header: "شرح تفصیل اعتبار", type: "string" as const, width: 320, hidden: true },
        ],
        charts: [
          { type: "bar" as const, title: "مبلغ پرداخت به تفکیک بانک عامل", xField: "بانک عامل", yField: "مبلغ پرداخت" },
        ],
        gridConfig: { density: "compact" as const, pageSize: 50 },
      },
    ],
    layout: [
      { type: "dataset" as const, datasetId: "main", title: "اعتبارات — یک سطر به ازای هر گشایش × سفارش" },
      { type: "dataset" as const, datasetId: "payments", title: "پرداخت‌ها و انتقال‌های انجام‌شده" },
    ],
    gridConfig: { density: "compact" as const, pageSize: 100, pinFirstColumn: false },
    validation: { maxRows: 5000, queryTimeoutSec: 90 },
  },
  {
    // The drill-down: one row per invoice line. Open it filtered by
    // شماره سفارش from the summary report above.
    id: "lc-report",
    nameFa: "گزارش ال سی — ریز اقلام (سطر فاکتور)",
    moduleId: "financial",
    dataSourceId: "rahkaran",
    sqlFile: "lc.sql",
    parameters: [
      { name: "STARTDATE", label: "از تاریخ سررسید", type: "jalali-date" as const, nullable: true },
      { name: "ENDDATE", label: "تا تاریخ سررسید", type: "jalali-date" as const, nullable: true },
      { name: "dl4", label: "طرف مقابل (بستانکار)", type: "lookup" as const, nullable: true, lookupCatalogSlug: "dl-titles" },
      { name: "dl5", label: "بانک عامل", type: "lookup" as const, nullable: true, lookupCatalogSlug: "bank-g" },
      { name: "OrderNumber", label: "شماره سفارش", type: "text" as const, nullable: true },
      {
        name: "DebtStatus",
        label: "وضعیت بدهی",
        type: "select" as const,
        nullable: true,
        options: [
          { value: "معوق", label: "معوق" },
          { value: "تسویه شده", label: "تسویه شده" },
          { value: "مازاد پرداخت", label: "مازاد پرداخت" },
        ],
      },
    ],
    columns: [
      { field: "ردیف", header: "ردیف", type: "number" as const, width: 70 },
      { field: "تاریخ سررسید", header: "تاریخ سررسید", type: "string" as const, width: 120 },
      { field: "تاریخ فاکتور", header: "تاریخ فاکتور", type: "string" as const, width: 120 },
      { field: "تاریخ سند", header: "تاریخ سند", type: "string" as const, width: 120 },
      { field: "طرف بستانکار", header: "طرف بستانکار", type: "string" as const, width: 200 },
      { field: "بانک عامل", header: "بانک عامل", type: "string" as const, width: 150 },
      { field: "شرح بدهی", header: "شرح بدهی", type: "string" as const, width: 300 },
      { field: "شماره سفارش", header: "شماره سفارش", type: "string" as const, width: 130 },
      { field: "شماره اعتبار", header: "شماره اعتبار", type: "string" as const, width: 120 },
      { field: "بستانکار", header: "بستانکار", type: "string" as const, width: 130 },
      { field: "بدهکار", header: "بدهکار", type: "string" as const, width: 130 },
      { field: "مبلغ فاکتور", header: "مبلغ فاکتور", type: "string" as const, width: 130 },
      { field: "میان دریافت", header: "میان دریافت", type: "string" as const, width: 120 },
      { field: "پیش دریافت", header: "پیش دریافت", type: "string" as const, width: 120 },
      { field: "مبلغ جزء", header: "مبلغ جزء", type: "string" as const, width: 130 },
      { field: "مبلغ کل", header: "مبلغ کل", type: "string" as const, width: 130 },
      { field: "مبلغ پرداخت شده", header: "مبلغ پرداخت شده", type: "string" as const, width: 140 },
      { field: "مانده بدهی", header: "مانده بدهی", type: "string" as const, width: 130 },
      { field: "وضعیت بدهی", header: "وضعیت بدهی", type: "string" as const, width: 120 },
      { field: "مبلغ گشایش", header: "مبلغ گشایش", type: "string" as const, width: 130 },
      { field: "تاریخ گشایش", header: "تاریخ گشایش", type: "string" as const, width: 120 },
      { field: "مدت گشایش", header: "مدت گشایش", type: "string" as const, width: 110 },
      { field: "مهلت روز", header: "مهلت روز", type: "number" as const, width: 90 },
      { field: "منبع تاریخ", header: "منبع تاریخ", type: "string" as const, width: 130 },
      { field: "شرح اعتبار اسنادی", header: "شرح اعتبار اسنادی", type: "string" as const, width: 300 },
    ],
    charts: [
      { type: "bar" as const, title: "مانده بدهی به تفکیک طرف بستانکار", xField: "طرف بستانکار", yField: "مانده بدهی" },
      { type: "pie" as const, title: "وضعیت بدهی", xField: "وضعیت بدهی", yField: "ردیف" },
    ],
    grouping: {
      groupBy: ["طرف بستانکار"],
      aggregates: [{ field: "مانده بدهی", func: "sum", label: "جمع مانده" }],
    },
    validation: { maxRows: 10000, queryTimeoutSec: 60 },
  },
  {
    id: "bank-balance",
    nameFa: "گزارش موجودی بانک",
    moduleId: "financial",
    dataSourceId: "rahkaran",
    sqlFile: "bank-balance.sql",
    parameters: [
      { name: "StartDate", label: "از تاریخ", type: "jalali-date" as const, nullable: true },
      { name: "EndDate", label: "تا تاریخ", type: "jalali-date" as const, nullable: true },
      { name: "BankName", label: "نام بانک", type: "text" as const, nullable: true },
      { name: "LedgerRef", label: "دفتر کل", type: "number" as const, nullable: true },
      { name: "BranchRef", label: "شعبه", type: "number" as const, nullable: true },
      { name: "TopCount", label: "حداکثر ردیف", type: "number" as const, nullable: true },
    ],
    columns: [
      { field: "BankAccountNumber", header: "شماره حساب", type: "string" as const, width: 140 },
      { field: "BankName", header: "بانک", type: "string" as const, width: 160 },
      { field: "BankBranchName", header: "شعبه", type: "string" as const, width: 140 },
      { field: "CurrencyTitle", header: "ارز", type: "string" as const, width: 100 },
      { field: "BeginingBalance", header: "مانده اول دوره", type: "string" as const, width: 140 },
      { field: "TotalDebit", header: "جمع بدهکار", type: "string" as const, width: 130 },
      { field: "TotalCredit", header: "جمع بستانکار", type: "string" as const, width: 130 },
      { field: "EndingBalance", header: "مانده پایان دوره", type: "string" as const, width: 140 },
      { field: "TotalBankTransfer", header: "انتقال بانکی", type: "string" as const, width: 130 },
      { field: "TotalShortTermDurationPaid", header: "کوتاه‌مدت پرداختی", type: "string" as const, width: 150 },
      { field: "TotalLongTermDurationPaid", header: "بلندمدت پرداختی", type: "string" as const, width: 150 },
      { field: "TotalGuaranteePaid", header: "تضمین پرداختی", type: "string" as const, width: 130 },
      { field: "TotalPrePaid", header: "پیش‌پرداخت", type: "string" as const, width: 120 },
    ],
    charts: [
      { type: "bar" as const, title: "مانده به تفکیک بانک", xField: "BankName", yField: "BeginingBalance" },
    ],
    validation: { maxRows: 20000, queryTimeoutSec: 45 },
  },
  {
    id: "deposit-report",
    nameFa: "گزارش سپرده",
    moduleId: "financial",
    dataSourceId: "rahkaran",
    sqlFile: "deposit.sql",
    parameters: [
      { name: "STARTDATE", label: "از تاریخ", type: "jalali-date" as const, nullable: true },
      { name: "ENDDATE", label: "تا تاریخ", type: "jalali-date" as const, nullable: true },
      { name: "BankFilter", label: "بانک", type: "text" as const, nullable: true },
      { name: "RateFilter", label: "نرخ", type: "text" as const, nullable: true },
      { name: "StatusFilter", label: "وضعیت", type: "text" as const, nullable: true },
    ],
    columns: [
      { field: "ردیف", header: "ردیف", type: "number" as const, width: 70 },
      { field: "نام بانک", header: "نام بانک", type: "string" as const, width: 160 },
      { field: "وضعیت بانک", header: "وضعیت بانک", type: "string" as const, width: 120 },
      { field: "حساب", header: "حساب", type: "string" as const, width: 140 },
      { field: "نام تامین کننده", header: "نام تامین کننده", type: "string" as const, width: 180 },
      { field: "شماره گشایش", header: "شماره گشایش", type: "string" as const, width: 130 },
      { field: "شماره سپرده", header: "شماره سپرده", type: "string" as const, width: 130 },
      { field: "سپرده", header: "سپرده", type: "string" as const, width: 120 },
      { field: "نرخ سود سپرده", header: "نرخ سود سپرده", type: "string" as const, width: 120 },
      { field: "تاریخ سر رسید سپرده", header: "تاریخ سر رسید سپرده", type: "string" as const, width: 140 },
      { field: "تاریخ افتتاح سپرده", header: "تاریخ افتتاح سپرده", type: "string" as const, width: 140 },
      { field: "وضعیت", header: "وضعیت", type: "string" as const, width: 110 },
      { field: "بستانکار", header: "بستانکار", type: "string" as const, width: 130 },
      { field: "بدهکار", header: "بدهکار", type: "string" as const, width: 130 },
      { field: "مانده کل تاریخچه", header: "مانده کل تاریخچه", type: "string" as const, width: 150 },
      { field: "شرح", header: "شرح", type: "string" as const, width: 260 },
    ],
    charts: [
      { type: "bar" as const, title: "سپرده به تفکیک بانک", xField: "نام بانک", yField: "مانده کل تاریخچه" },
    ],
    validation: { maxRows: 20000, queryTimeoutSec: 45 },
  },
  {
    id: "murabaha-report",
    nameFa: "گزارش تسهیلات (مرابحه)",
    moduleId: "financial",
    dataSourceId: "rahkaran",
    sqlFile: "murabaha.sql",
    parameters: [
      { name: "ReceiptDateFrom", label: "از تاریخ دریافت", type: "jalali-date" as const, nullable: true },
      { name: "ReceiptDateTo", label: "تا تاریخ دریافت", type: "jalali-date" as const, nullable: true },
      { name: "DueDateFrom", label: "از سررسید (شمسی متنی)", type: "text" as const, nullable: true },
      { name: "DueDateTo", label: "تا سررسید (شمسی متنی)", type: "text" as const, nullable: true },
      { name: "BankTitleFilter", label: "بانک عامل", type: "text" as const, nullable: true },
      { name: "ContractTypeTitleFilter", label: "نوع قرارداد", type: "text" as const, nullable: true },
      { name: "LedgerID", label: "دفتر", type: "number" as const, nullable: true },
      { name: "MurabahaID", label: "نوع مرابحه", type: "number" as const, nullable: true },
    ],
    columns: [
      { field: "ردیف", header: "ردیف", type: "string" as const, width: 70 },
      { field: "تاریخ سررسید", header: "تاریخ سررسید", type: "string" as const, width: 120 },
      { field: "نوع قرارداد", header: "نوع قرارداد", type: "string" as const, width: 150 },
      { field: "بانک عامل", header: "بانک عامل", type: "string" as const, width: 150 },
      { field: "شرح بدهی", header: "شرح بدهی", type: "string" as const, width: 260 },
      { field: "تاریخ انعقاد", header: "تاریخ انعقاد", type: "string" as const, width: 120 },
      { field: "اصل", header: "اصل", type: "string" as const, width: 130 },
      { field: "بهره اولیه", header: "بهره اولیه", type: "string" as const, width: 120 },
      { field: "مبلغ جز", header: "مبلغ جز", type: "string" as const, width: 130 },
      { field: "مبلغ کل", header: "مبلغ کل", type: "string" as const, width: 130 },
      { field: "تاریخ دریافت", header: "تاریخ دریافت", type: "string" as const, width: 120 },
      { field: "مدت به ماه", header: "مدت به ماه", type: "string" as const, width: 110 },
    ],
    charts: [
      { type: "bar" as const, title: "مبلغ کل به تفکیک بانک", xField: "بانک عامل", yField: "مبلغ کل" },
    ],
    validation: { maxRows: 20000, queryTimeoutSec: 60 },
  },
  {
    id: "raw-material-purchase",
    nameFa: "گزارش خرید مواد اولیه",
    moduleId: "warehouse",
    dataSourceId: "rahkaran",
    sqlFile: "raw-material-purchase.sql",
    parameters: [
      { name: "aztarikh", label: "از تاریخ", type: "jalali-date" as const, nullable: true },
      { name: "tatarikh", label: "تا تاریخ", type: "jalali-date" as const, nullable: true },
      { name: "supplierid", label: "تامین‌کننده", type: "lookup" as const, nullable: true, lookupCatalogSlug: "suppliers" },
      { name: "partname", label: "نام کالا", type: "text" as const, nullable: true },
    ],
    columns: [
      { field: "تامین کننده", header: "تامین کننده", type: "string" as const, width: 200 },
      { field: "تاریخ سفارش خرید", header: "تاریخ سفارش خرید", type: "string" as const, width: 130 },
      { field: "سفارش خرید", header: "سفارش خرید", type: "string" as const, width: 140 },
      { field: "نام کالا", header: "نام کالا", type: "string" as const, width: 200 },
      { field: "مقدار سفارش", header: "مقدار سفارش", type: "number" as const, width: 130 },
      { field: "مقدار رسید شده", header: "مقدار رسید شده", type: "number" as const, width: 140 },
      { field: "مانده سفارش", header: "مانده سفارش", type: "number" as const, width: 130 },
    ],
    charts: [
      { type: "bar" as const, title: "مانده سفارش به تفکیک تامین‌کننده", xField: "تامین کننده", yField: "مانده سفارش" },
    ],
    gridConfig: {
      density: "compact" as const,
      pinFirstColumn: true,
      pageSize: 50,
    },
    validation: { maxRows: 20000, queryTimeoutSec: 60 },
  },
];

export const reportDefinitions: ReportDefinition[] = rawDefinitions.map((d) =>
  normalizeDefinition(d),
);

export function getReportById(id: string): ReportDefinition | undefined {
  return reportDefinitions.find((r) => r.id === id);
}

export function getReportsByModule(moduleId: string): ReportDefinition[] {
  return reportDefinitions.filter((r) => r.moduleId === moduleId);
}

export const DEFAULT_LOOKUP_CATALOGS = [
  {
    slug: "dl-titles",
    nameFa: "عناوین تفصیلی (DL)",
    description: "طرف مقابل / تفصیلی از fin3.DL",
    lookupSql:
      "SELECT TOP 200 Title AS Code, Title AS Label FROM fin3.DL WHERE Title IS NOT NULL AND LTRIM(RTRIM(Title)) <> N'' ORDER BY Title",
    dataSourceKey: "rahkaran",
  },
  {
    slug: "bank-g",
    nameFa: "بانک عامل",
    description: "SYS3.Lookup Type=BankG",
    lookupSql:
      "SELECT Code, Value AS Label FROM SYS3.Lookup WHERE Type = N'BankG' ORDER BY Value",
    dataSourceKey: "rahkaran",
  },
  {
    slug: "suppliers",
    nameFa: "تامین‌کنندگان",
    description: "PRC3.Supplier",
    lookupSql:
      "SELECT TOP 500 CAST(s.SupplierID AS NVARCHAR(50)) AS Code, ISNULL(p.FullName, CAST(s.SupplierID AS NVARCHAR(50))) AS Label FROM PRC3.Supplier s LEFT JOIN GNR3.Party p ON p.PartyID = s.PartyRef ORDER BY Label",
    dataSourceKey: "rahkaran",
  },
];
