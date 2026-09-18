#!/usr/bin/env npx tsx
/**
 * Publishes the code-defined report definitions with the given ids into the
 * database, bumping their published version. Reports are served from the DB,
 * so a deploy that changes src/lib/reports/definitions.ts has no visible
 * effect until this runs. Unlike `db:seed`, it touches only the named reports
 * (no admin password reset, no overwrite of other reports edited in Studio).
 *
 *   npx tsx scripts/publish-reports.ts lc-summary lc-report
 */
import { prisma } from "../src/lib/db/prisma";
import { upsertReportDefinition } from "../src/lib/reports/registry";
import { reportDefinitions } from "../src/lib/reports/definitions";

async function main() {
  const ids = process.argv.slice(2);
  if (!ids.length) {
    throw new Error("Usage: publish-reports.ts <report-id> [<report-id> ...]");
  }

  const unknown = ids.filter((id) => !reportDefinitions.some((r) => r.id === id));
  if (unknown.length) {
    throw new Error(
      `Unknown report id(s): ${unknown.join(", ")}. Known: ${reportDefinitions.map((r) => r.id).join(", ")}`,
    );
  }

  for (const id of ids) {
    const definition = reportDefinitions.find((r) => r.id === id)!;
    const { version } = await upsertReportDefinition(definition, {
      publish: true,
      note: "publish-reports script",
    });
    console.log(`Published ${id} (version ${version})`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
