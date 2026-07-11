import type { ReportDefinition } from "@/types/report";
import { normalizeDefinition } from "@/types/report";

const rawDefinitions = [
  {
    id: "lc-report",
    nameFa: "گزارش ال سی (اعتبارات اسنادی)",
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
