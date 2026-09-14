import { formatJalaliDate } from "@/lib/entities/format";
import type { LetterOfCreditRecord } from "@/lib/entities/registry";
import type { Rule, RuleFindingRow } from "../types";

const faAmount = (n: number) => new Intl.NumberFormat("fa-IR").format(Math.round(n));

/**
 * Layer 3 of docs/architecture/lc-monitoring.md — five rules over the
 * "LetterOfCredit" Business Entity (src/lib/entities/definitions/lc.ts).
 * All read the entity rather than querying Rahkaran directly, because the
 * entity already ran the FIFO settlement (a CURSOR over temp tables — not
 * expressible as a rule's own single SELECT). Filed under FIN/CFO, not
 * IPR/foreign-trade — this customer books LCs through the general ledger,
 * never through the unused IPR3 module (see the doc's §4).
 *
 * `daysUntilDue` follows the same sign convention as `Receivable`'s field
 * of the same name: negative = overdue, null = nothing currently open.
 */

function overdueEvaluate(records: LetterOfCreditRecord[]): RuleFindingRow[] {
  return records
    .filter((r) => r.remainingDebt > 0 && r.daysUntilDue != null && r.daysUntilDue < 0)
    .map((r) => ({
      entity_id: r.externalId,
      title: `اعتبار ${r.lcIdentifier ?? r.externalId} — ${r.counterpartName ?? "ذی‌نفع نامشخص"}`,
      detail: `سفارش ${r.orderNumber ?? "—"} — بانک ${r.bankName ?? "—"} — سررسید ${formatJalaliDate(r.nextDueDate as string)} — ${Math.abs(r.daysUntilDue as number)} روز گذشته — مانده ${faAmount(r.remainingDebt)} ریال`,
      amount: r.remainingDebt,
      ref_date: r.nextDueDate,
    }))
    .sort((a, b) => new Date(a.ref_date as string).getTime() - new Date(b.ref_date as string).getTime());
}

function dueSoonEvaluate(
  records: LetterOfCreditRecord[],
  params: Record<string, number>,
): RuleFindingRow[] {
  const horizon = params.horizonDays ?? 7;
  return records
    .filter(
      (r) =>
        r.remainingDebt > 0 &&
        r.daysUntilDue != null &&
        r.daysUntilDue >= 0 &&
        r.daysUntilDue <= horizon,
    )
    .map((r) => ({
      entity_id: r.externalId,
      title: `اعتبار ${r.lcIdentifier ?? r.externalId} — ${r.counterpartName ?? "ذی‌نفع نامشخص"}`,
      detail: `سفارش ${r.orderNumber ?? "—"} — بانک ${r.bankName ?? "—"} — سررسید ${formatJalaliDate(r.nextDueDate as string)} — ${r.daysUntilDue} روز دیگر — مانده ${faAmount(r.remainingDebt)} ریال`,
      amount: r.remainingDebt,
      ref_date: r.nextDueDate,
    }))
    .sort((a, b) => new Date(a.ref_date as string).getTime() - new Date(b.ref_date as string).getTime());
}

function overUtilisedEvaluate(records: LetterOfCreditRecord[]): RuleFindingRow[] {
  return records
    .filter(
      (r) => r.openingAmount != null && r.openingAmount > 0 && r.totalInvoiced > r.openingAmount,
    )
    .map((r) => {
      const openingAmount = r.openingAmount as number;
      const overage = r.totalInvoiced - openingAmount;
      return {
        entity_id: r.externalId,
        title: `مصرف بیش از سقف — اعتبار ${r.lcIdentifier ?? r.externalId}`,
        detail: `${r.counterpartName ?? "ذی‌نفع نامشخص"} — مبلغ گشایش ${faAmount(openingAmount)} ریال — اسناد واصله ${faAmount(r.totalInvoiced)} ریال — مازاد مصرف ${faAmount(overage)} ریال`,
        amount: overage,
        ref_date: r.openingDate,
      };
    })
    .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));
}

function unusedCreditEvaluate(
  records: LetterOfCreditRecord[],
  params: Record<string, number>,
): RuleFindingRow[] {
  const minAgeDays = params.minAgeDays ?? 30;
  const now = Date.now();
  return records
    .filter((r) => {
      if (!r.openingAmount || r.openingAmount <= 0 || r.totalInvoiced !== 0 || !r.openingDate) {
        return false;
      }
      const ageDays = (now - new Date(r.openingDate).getTime()) / 86_400_000;
      return ageDays >= minAgeDays;
    })
    .map((r) => ({
      entity_id: r.externalId,
      title: `اعتبار باز و مصرف‌نشده — ${r.lcIdentifier ?? r.externalId}`,
      detail: `${r.counterpartName ?? "ذی‌نفع نامشخص"} — گشایش ${formatJalaliDate(r.openingDate as string)} به مبلغ ${faAmount(r.openingAmount as number)} ریال — هنوز هیچ سندی روی آن ارائه نشده`,
      amount: r.openingAmount,
      ref_date: r.openingDate,
    }))
    .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));
}

function dataQualityEvaluate(records: LetterOfCreditRecord[]): RuleFindingRow[] {
  return records
    .filter((r) => r.dqFlags > 0)
    .sort((a, b) => b.dqFlags - a.dqFlags)
    .map((r) => ({
      entity_id: r.externalId,
      title: `ایراد داده در عنوان تفصیلی اعتبار — ${r.lcIdentifier ?? r.externalId}`,
      detail: `${r.counterpartName ?? "ذی‌نفع نامشخص"} — سفارش ${r.orderNumber ?? "—"} — ${r.dqFlags} مورد از (شماره اعتبار، شماره سفارش، مهلت، مبلغ گشایش) از متن عنوان قابل استخراج نبود`,
      amount: null,
      ref_date: null,
    }));
}

export {
  overdueEvaluate,
  dueSoonEvaluate,
  overUtilisedEvaluate,
  unusedCreditEvaluate,
  dataQualityEvaluate,
};

export const lcRules: Rule[] = [
  {
    id: "fin.lc.overdue",
    module: "FIN",
    pack: "daily",
    severity: "critical",
    titleFa: "اعتبار اسنادی معوق",
    descriptionFa: "اعتبارات اسنادی‌ای که سررسیدشان گذشته و هنوز تسویه نشده‌اند.",
    whyItMattersFa:
      "بانک گشایش‌کننده پیش از هر گشایش جدید، بدهی غیرجاری متقاضی را استعلام می‌کند — یک اعتبار معوق می‌تواند ظرفیت گشایش اعتبار بعدی شرکت را ببندد. این صرفاً یک گزارش نیست؛ توان خرید فولاد ماه بعد است.",
    fixHintFa: "با بانک عامل و ذی‌نفع هماهنگ کنید تا مانده بدهی هرچه زودتر تسویه شود.",
    kind: "entity",
    entityKey: "LetterOfCredit",
    evaluate: overdueEvaluate as unknown as Rule["evaluate"],
  },

  {
    id: "fin.lc.due_soon",
    module: "FIN",
    pack: "daily",
    severity: "high",
    titleFa: "اعتبار اسنادی در شرف سررسید",
    descriptionFa: "اعتباراتی که در روزهای آینده سررسید می‌شوند و هنوز مانده بدهی دارند.",
    whyItMattersFa:
      "نقدینگی لازم برای سررسید باید از پیش آماده شود؛ غافلگیری در روز سررسید یعنی فردا تبدیل به «معوق» می‌شود.",
    fixHintFa: "مبلغ لازم را در برنامهٔ نقدینگی روزهای پیش‌رو لحاظ کنید.",
    params: [{ name: "horizonDays", labelFa: "افق پیش‌آگهی (روز)", defaultValue: 7 }],
    kind: "entity",
    entityKey: "LetterOfCredit",
    evaluate: dueSoonEvaluate as unknown as Rule["evaluate"],
  },

  {
    id: "fin.lc.over_utilised",
    module: "FIN",
    pack: "daily",
    severity: "high",
    titleFa: "مصرف اعتبار بیش از مبلغ گشایش",
    descriptionFa: "اعتباراتی که مجموع اسناد واصله‌شان از مبلغ گشایش بیشتر شده است.",
    whyItMattersFa: "یعنی اسنادی فراتر از سقف تعیین‌شده پذیرفته شده — نشانهٔ نقض کنترل داخلی سقف اعتبار.",
    fixHintFa: "علت مازاد مصرف را با واحد بازرگانی/مالی بررسی و مبلغ گشایش یا داده ثبت‌شده را اصلاح کنید.",
    kind: "entity",
    entityKey: "LetterOfCredit",
    evaluate: overUtilisedEvaluate as unknown as Rule["evaluate"],
  },

  {
    id: "fin.lc.unused_credit",
    module: "FIN",
    pack: "daily",
    severity: "medium",
    titleFa: "اعتبار گشایش‌شده و مصرف‌نشده",
    descriptionFa: "اعتباراتی که مدتی از گشایش‌شان گذشته اما هنوز هیچ سندی روی آن‌ها ارائه نشده.",
    whyItMattersFa: "سرمایهٔ در گردش و ظرفیت اعتباری شرکت را بدون دلیل مشخص قفل کرده — نقدینگی خفته.",
    fixHintFa: "با ذی‌نفع پیگیری کنید یا در صورت منتفی‌شدن معامله، اعتبار را ببندید.",
    params: [{ name: "minAgeDays", labelFa: "حداقل روز از گشایش", defaultValue: 30 }],
    kind: "entity",
    entityKey: "LetterOfCredit",
    evaluate: unusedCreditEvaluate as unknown as Rule["evaluate"],
  },

  {
    id: "fin.lc.data_quality",
    module: "FIN",
    pack: "daily",
    severity: "medium",
    titleFa: "ایراد داده در عنوان تفصیلی اعتبار اسنادی",
    descriptionFa:
      "اعتباراتی که شماره اعتبار، شماره سفارش، مهلت یا مبلغ گشایش‌شان از متن آزاد عنوان تفصیلی قابل استخراج نبوده.",
    whyItMattersFa:
      "قوانین بالا همگی روی همین متن آزاد بنا شده‌اند؛ یک داشبورد صادق باید بگوید چه زمانی نباید کاملاً به آن اعتماد کرد.",
    fixHintFa:
      "عنوان تفصیلی سطح ۶ را در راهکاران بر اساس الگوی «سفارش <شماره> ...-<مهلت>روزه-ش اعتبار *<شناسه>*» اصلاح کنید.",
    kind: "entity",
    entityKey: "LetterOfCredit",
    evaluate: dataQualityEvaluate as unknown as Rule["evaluate"],
  },
];
