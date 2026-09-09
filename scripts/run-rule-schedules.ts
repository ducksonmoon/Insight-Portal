#!/usr/bin/env npx tsx
/**
 * Cron-friendly runner for due rule schedules — the rule-engine counterpart
 * of run-schedules.ts. Call this from the same Task Scheduler/cron entry
 * (a different time, typically every 15–60 minutes so hourly rules stay
 * timely) so `RuleDefinition.nextRunAt` rows get processed and their
 * `RuleFinding`s stay current for the admin UI and (later) the Notification
 * Center.
 *
 *   npx tsx scripts/run-rule-schedules.ts
 */
import { prisma } from "../src/lib/db/prisma";
import { runDueRuleDefinitions } from "../src/lib/rules/persistence";

async function main() {
  const results = await runDueRuleDefinitions();

  for (const result of results) {
    if (result.status === "error") {
      console.error(`[rule] FAIL ${result.ruleCode}: ${result.error}`);
    } else {
      console.error(
        `[rule] OK ${result.ruleCode} — ${result.findingCount} finding(s), ${result.newCount} new, ${result.resolvedCount} resolved`,
      );
    }
  }

  console.error(`Processed ${results.length} rule schedule(s)`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
