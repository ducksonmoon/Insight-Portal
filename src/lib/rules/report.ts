import type { HealthScore } from "./score";
import { MODULE_LABEL_FA, SEVERITY_LABEL_FA, type RuleFinding, type RuleRunResult, type RuleRunSummary } from "./types";

/**
 * Renders a single self-contained, print-ready HTML file — the "sales kit".
 * Opened in any browser and printed (Ctrl+P → Save as PDF) with no server,
 * no extra dependency, and no network call. That constraint is deliberate:
 * this file gets handed to a finance manager who has no dev tooling.
 */

const numberFmt = new Intl.NumberFormat("fa-IR");
const rialFmt = (value: number) => `${numberFmt.format(Math.round(Math.abs(value)))} ریال`;

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatDate(value: Date | string | null): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("fa-IR-u-nu-latn");
}

function gradeColor(grade: HealthScore["grade"]): string {
  switch (grade) {
    case "excellent":
      return "#2F7D5C";
    case "good":
      return "#3F6488";
    case "fair":
      return "#A96B15";
    case "poor":
      return "#B2662F";
    case "critical":
      return "#B23A2F";
  }
}

function severityStripe(severity: RuleRunResult["severity"]): string {
  switch (severity) {
    case "critical":
      return "#B23A2F";
    case "high":
      return "#A96B15";
    case "medium":
      return "#3F6488";
    case "low":
      return "#5B6E73";
  }
}

function findingRow(finding: RuleFinding): string {
  return `
    <tr>
      <td class="entity">${escapeHtml(finding.title)}</td>
      <td>${escapeHtml(finding.detail)}</td>
      <td class="num">${finding.amount != null ? rialFmt(finding.amount) : "—"}</td>
      <td>${formatDate(finding.ref_date)}</td>
    </tr>`;
}

function ruleCard(result: RuleRunResult): string {
  const stripe = severityStripe(result.severity);
  const money = result.totalAmount ? `<span class="card-money">${rialFmt(result.totalAmount)}</span>` : "";
  const sample = result.findings.slice(0, 5).map(findingRow).join("");
  const more =
    result.count > 5 ? `<p class="more">و ${numberFmt.format(result.count - 5)} مورد دیگر در فایل کامل</p>` : "";

  return `
  <article class="card" style="border-inline-start-color:${stripe}">
    <header class="card-head">
      <div class="card-title">
        <span class="pill" style="color:${stripe};background:${stripe}14">${SEVERITY_LABEL_FA[result.severity]}</span>
        <span class="mod">${MODULE_LABEL_FA[result.module]}</span>
        <h3>${escapeHtml(result.titleFa)}</h3>
      </div>
      <div class="card-figures">
        <span class="card-count">${numberFmt.format(result.count)}</span>
        <span class="card-count-label">مورد</span>
        ${money}
      </div>
    </header>
    <table class="detail-table">
      <thead><tr><th>مورد</th><th>شرح</th><th>مبلغ</th><th>تاریخ</th></tr></thead>
      <tbody>${sample}</tbody>
    </table>
    ${more}
  </article>`;
}

export interface HealthReportOptions {
  companyNameFa: string;
  generatedAt?: Date;
}

export function renderHealthReportHtml(
  summary: RuleRunSummary,
  score: HealthScore,
  options: HealthReportOptions,
): string {
  const generatedAt = options.generatedAt ?? summary.runAt;
  const color = gradeColor(score.grade);
  const failed = summary.failed;

  const cards = failed.map(ruleCard).join("\n");

  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8" />
<title>گزارش سلامت دادهٔ مالی — ${escapeHtml(options.companyNameFa)}</title>
<style>
  :root {
    --ground: #F4F6F5;
    --surface: #FFFFFF;
    --ink: #111A1D;
    --ink-soft: #47575C;
    --ink-faint: #7C8C91;
    --rule: #DBE2E0;
    --rule-strong: #C2CDCA;
    --accent: #0D7A6F;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--ground);
    color: var(--ink);
    font-family: "Vazirmatn", "Segoe UI", Tahoma, sans-serif;
    font-size: 13.5px;
    line-height: 1.7;
  }
  .sheet { max-width: 880px; margin: 0 auto; padding: 2.5rem 2rem 4rem; }

  .cover {
    background: var(--surface);
    border: 1px solid var(--rule);
    border-radius: 6px;
    padding: 2rem 2.25rem;
    margin-bottom: 2rem;
  }
  .cover-eyebrow { color: var(--ink-faint); font-size: .8rem; letter-spacing: .02em; margin-bottom: .35rem; }
  .cover h1 { margin: 0 0 .3rem; font-size: 1.5rem; letter-spacing: -.01em; }
  .cover .meta { color: var(--ink-soft); font-size: .85rem; margin-bottom: 1.5rem; }

  .score-row { display: flex; align-items: center; gap: 2rem; flex-wrap: wrap; }
  .gauge {
    width: 132px; height: 132px; border-radius: 50%;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    border: 10px solid ${color}22;
    position: relative;
    flex-shrink: 0;
  }
  .gauge::before {
    content: ""; position: absolute; inset: -10px; border-radius: 50%;
    border: 10px solid ${color};
    clip-path: inset(0 0 ${100 - score.score}% 0);
  }
  .gauge .num { font-size: 2rem; font-weight: 700; font-variant-numeric: tabular-nums; color: ${color}; z-index: 1; }
  .gauge .unit { font-size: .7rem; color: var(--ink-faint); z-index: 1; }

  .score-explain { flex: 1; min-width: 220px; }
  .score-grade { display: inline-block; font-weight: 700; color: ${color}; font-size: 1.05rem; margin-bottom: .3rem; }
  .score-sentence { color: var(--ink-soft); font-size: .9rem; max-width: 46ch; }

  .strip {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1px;
    background: var(--rule); border: 1px solid var(--rule); border-radius: 5px; overflow: hidden;
    margin-bottom: 2rem;
  }
  .stat { background: var(--surface); padding: .8rem .9rem .9rem; min-width: 0; }
  .stat .label { font-size: .72rem; color: var(--ink-faint); display: block; margin-bottom: .15rem; }
  .stat .value {
    display: block;
    font-size: 1.1rem; font-weight: 700; font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere; word-break: break-word; line-height: 1.3;
  }

  h2.section { font-size: 1.05rem; margin: 2rem 0 1rem; padding-bottom: .5rem; border-bottom: 1px solid var(--rule-strong); }

  .card {
    background: var(--surface); border: 1px solid var(--rule); border-inline-start: 4px solid;
    border-radius: 5px; padding: 1rem 1.15rem 1.1rem; margin-bottom: 1rem;
    page-break-inside: avoid;
  }
  .card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: .6rem; flex-wrap: wrap; }
  .card-title { display: flex; align-items: center; flex-wrap: wrap; gap: .5rem; }
  .card-title h3 { margin: 0; font-size: .98rem; font-weight: 650; width: 100%; }
  .pill { font-size: .68rem; font-weight: 600; padding: .1rem .45rem; border-radius: 3px; }
  .mod { font-size: .72rem; color: var(--ink-faint); border: 1px solid var(--rule-strong); border-radius: 3px; padding: .05rem .4rem; }
  .card-figures { text-align: left; white-space: nowrap; }
  .card-count { font-size: 1.15rem; font-weight: 700; font-variant-numeric: tabular-nums; }
  .card-count-label { font-size: .72rem; color: var(--ink-faint); margin-inline-start: .2rem; }
  .card-money { display: block; font-size: .78rem; color: var(--ink-soft); font-variant-numeric: tabular-nums; }

  .detail-table { width: 100%; border-collapse: collapse; font-size: .8rem; margin-top: .4rem; }
  .detail-table th { text-align: right; font-size: .7rem; color: var(--ink-faint); font-weight: 600; padding: 0 .5rem .3rem 0; border-bottom: 1px solid var(--rule-strong); }
  .detail-table td { padding: .35rem .5rem .35rem 0; border-bottom: 1px solid var(--rule); color: var(--ink-soft); }
  .detail-table td.entity { color: var(--ink); font-weight: 500; }
  .detail-table td.num { font-variant-numeric: tabular-nums; white-space: nowrap; }
  .more { font-size: .74rem; color: var(--ink-faint); margin: .5rem 0 0; }

  .clean-note {
    background: var(--surface); border: 1px solid var(--rule); border-radius: 5px;
    padding: 1rem 1.15rem; color: var(--ink-soft); font-size: .88rem;
  }

  .methodology {
    margin-top: 2.5rem; padding-top: 1rem; border-top: 1px solid var(--rule-strong);
    font-size: .78rem; color: var(--ink-faint);
  }
  .methodology b { color: var(--ink-soft); }

  @media print {
    body { background: #fff; }
    .sheet { padding: 0; max-width: none; }
    .cover, .card, .stat { box-shadow: none; }
    @page { margin: 16mm 14mm; }
  }
</style>
</head>
<body>
  <div class="sheet">
    <section class="cover">
      <div class="cover-eyebrow">گزارش سلامت دادهٔ مالی</div>
      <h1>${escapeHtml(options.companyNameFa)}</h1>
      <div class="meta">تاریخ اسکن: ${formatDate(generatedAt)} · اتصال فقط‌خواندنی به راهکاران · ${numberFmt.format(summary.totals.rulesRun)} قانون اجرا شد</div>

      <div class="score-row">
        <div class="gauge">
          <span class="num">${score.score}</span>
          <span class="unit">از ۱۰۰</span>
        </div>
        <div class="score-explain">
          <span class="score-grade">${score.gradeLabelFa}</span>
          <p class="score-sentence">
            این نمره از شدت و تعداد مشکلات یافت‌شده در دفتر کل و خزانه محاسبه شده است.
            امتیاز ۱۰۰ یعنی هیچ مغایرتی یافت نشد؛ هر مشکل بحرانی سهم بیشتری در کاهش آن دارد.
          </p>
        </div>
      </div>
    </section>

    <div class="strip">
      <div class="stat"><span class="label">قوانین با یافته</span><span class="value">${summary.totals.rulesFailed} از ${summary.totals.rulesRun}</span></div>
      <div class="stat"><span class="label">کل مشکلات</span><span class="value">${numberFmt.format(summary.totals.findings)}</span></div>
      <div class="stat"><span class="label">مبلغ درگیر</span><span class="value">${rialFmt(summary.totals.amountAtRisk)}</span></div>
      <div class="stat"><span class="label">زمان اسکن</span><span class="value">${(summary.durationMs / 1000).toFixed(0)} ثانیه</span></div>
    </div>

    <h2 class="section">یافته‌ها به ترتیب اهمیت</h2>
    ${cards || `<div class="clean-note">در این اجرا هیچ مغایرتی یافت نشد.</div>`}

    <p class="methodology">
      <b>روش کار:</b> این گزارش صرفاً با اجرای پرس‌وجوهای فقط‌خواندنی روی پایگاه‌دادهٔ راهکاران تولید شده و
      هیچ داده‌ای تغییر نکرده است. هر قانون یک بررسی مستقل روی جداول دفتر کل، اسناد، تفصیلی‌ها و
      دریافت/پرداخت است. برای توضیح کامل هر قانون و نحوهٔ رفع آن با تیم فنی تماس بگیرید.
    </p>
  </div>
</body>
</html>`;
}
