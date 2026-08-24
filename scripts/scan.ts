/**
 * Data-health / daily-exception scan against a read-only Rahkaran connection.
 *
 *   npm run scan                    # every rule
 *   npm run scan -- --pack health   # data integrity only
 *   npm run scan -- --pack daily    # this morning's exceptions
 *   npm run scan -- --module RPA
 *   npm run scan -- --json out.json # machine-readable, for the portal or a demo
 *   npm run scan -- --report out.html --company "شرکت نمونه"
 *                                    # printable sales-kit report (Ctrl+P → PDF)
 *
 * Requires RAHKARAN_DB_* in .env.local. Never writes to Rahkaran.
 */
import { writeFileSync } from "node:fs";
import { prisma } from "../src/lib/db/prisma";
import { runRules } from "../src/lib/rules/engine";
import { applyExceptions } from "../src/lib/rules/exceptions";
import { allRules } from "../src/lib/rules/packs";
import { renderHealthReportHtml } from "../src/lib/rules/report";
import { computeHealthScore } from "../src/lib/rules/score";
import {
  MODULE_LABEL_FA,
  SEVERITY_LABEL_FA,
  type RuleModule,
  type RulePack,
} from "../src/lib/rules/types";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const fmt = new Intl.NumberFormat("fa-IR");

async function main() {
  const pack = arg("pack") as RulePack | undefined;
  const moduleArg = arg("module");
  const jsonPath = arg("json");
  const reportPath = arg("report");
  const companyName = arg("company") ?? "شرکت نمونه";

  if (pack && pack !== "health" && pack !== "daily") {
    throw new Error(`--pack must be "health" or "daily", got "${pack}"`);
  }

  const rawSummary = await runRules(allRules, {
    pack,
    modules: moduleArg ? (moduleArg.split(",") as RuleModule[]) : undefined,
  });

  const rawFindings = rawSummary.totals.findings;
  let summary = rawSummary;
  try {
    summary = await applyExceptions(rawSummary);
  } catch (error) {
    console.log(
      "! فهرست استثناها در دسترس نبود (اتصال به دیتابیس اپ برقرار نشد)؛ " +
        "نتایج بدون فیلتر استثنا نمایش داده می‌شود.",
    );
  }
  const suppressed = rawFindings - summary.totals.findings;

  const { totals } = summary;

  const score = computeHealthScore(summary);

  console.log("");
  console.log("═".repeat(64));
  console.log(`  اسکن سلامت داده — ${summary.results.length} قانون اجرا شد`);
  console.log(`  نمرهٔ سلامت: ${score.score}/۱۰۰ (${score.gradeLabelFa})`);
  console.log("═".repeat(64));

  for (const result of summary.failed) {
    const badge = SEVERITY_LABEL_FA[result.severity].padEnd(6);
    const money = result.totalAmount
      ? ` — ${fmt.format(Math.round(Math.abs(result.totalAmount)))} ریال`
      : "";

    console.log("");
    console.log(`[${badge}] ${result.titleFa}  (${MODULE_LABEL_FA[result.module]})`);
    console.log(`          ${result.count} مورد${money}`);

    for (const finding of result.findings.slice(0, 3)) {
      console.log(`          · ${finding.title} — ${finding.detail}`);
    }
    if (result.count > 3) {
      console.log(`          … و ${result.count - 3} مورد دیگر`);
    }
  }

  const errored = summary.results.filter((result) => result.status === "error");
  if (errored.length) {
    console.log("");
    console.log("قوانینی که اجرا نشدند (احتمالاً نسخهٔ راهکاران متفاوت است):");
    for (const result of errored) {
      console.log(`  ! ${result.ruleId}: ${result.error}`);
    }
  }

  console.log("");
  console.log("─".repeat(64));
  console.log(
    `  ${totals.rulesFailed} قانون از ${totals.rulesRun} مورد یافت — ` +
      `${fmt.format(totals.findings)} مشکل`,
  );
  if (totals.amountAtRisk > 0) {
    console.log(`  مبلغ درگیر: ${fmt.format(Math.round(totals.amountAtRisk))} ریال`);
  }
  console.log(`  زمان اجرا: ${(summary.durationMs / 1000).toFixed(1)} ثانیه`);
  if (suppressed > 0) {
    console.log(`  ${suppressed} مورد به‌عنوان استثنای تأییدشده پنهان شد`);
  }
  console.log("─".repeat(64));
  console.log("");

  if (jsonPath) {
    writeFileSync(jsonPath, JSON.stringify(summary, null, 2), "utf8");
    console.log(`خروجی JSON نوشته شد: ${jsonPath}`);
  }

  if (reportPath) {
    const html = renderHealthReportHtml(summary, score, { companyNameFa: companyName });
    writeFileSync(reportPath, html, "utf8");
    console.log(`گزارش فروش نوشته شد: ${reportPath}`);
    console.log(`  در مرورگر باز کنید و Ctrl+P → "Save as PDF" بزنید.`);
  }
}

main()
  .catch((error) => {
    console.error("اسکن شکست خورد:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit();
  });
