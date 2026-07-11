#!/usr/bin/env npx tsx
/**
 * Scaffold a new report from an existing .sql file.
 *
 * Usage:
 *   npm run report:scaffold -- --id bank-balance --module financial --nameFa "موجودی بانک" --sql ./path/to/file.sql
 */
import fs from "fs";
import path from "path";

import { extractSqlParameters, getSqlDir, writeSqlFile } from "../src/lib/reports/sql-loader";
import { normalizeDefinition, type ReportParameter } from "../src/types/report";

function arg(name: string, fallback?: string) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function guessParamType(name: string): ReportParameter["type"] {
  const n = name.toLowerCase();
  if (n.includes("date") || n.includes("tarikh") || n === "startdate" || n === "enddate") {
    return "jalali-date";
  }
  if (
    n.includes("id") ||
    n.includes("count") ||
    n.includes("ref") ||
    n.includes("ledger") ||
    n.includes("branch")
  ) {
    return "number";
  }
  return "text";
}

function main() {
  const id = arg("id");
  const moduleId = arg("module", "financial");
  const nameFa = arg("nameFa", id ?? "گزارش جدید");
  const sqlPath = arg("sql");

  if (!id || !sqlPath) {
    console.error(
      "Usage: npm run report:scaffold -- --id <slug> --module financial --nameFa \"...\" --sql <file.sql>",
    );
    process.exit(1);
  }

  const abs = path.resolve(sqlPath);
  if (!fs.existsSync(abs)) {
    console.error(`SQL file not found: ${abs}`);
    process.exit(1);
  }

  const sqlText = fs.readFileSync(abs, "utf-8");
  const sqlFile = `${id}.sql`;
  writeSqlFile(sqlFile, sqlText);

  const params = extractSqlParameters(sqlText);
  const parameters: ReportParameter[] = params.map((name) => ({
    name,
    label: name,
    type: guessParamType(name),
    nullable: true,
  }));

  const definition = normalizeDefinition({
    id,
    nameFa: nameFa!,
    moduleId: moduleId!,
    dataSourceId: "rahkaran",
    sqlFile,
    parameters,
    columns: [],
    charts: [],
    validation: { maxRows: 10000, queryTimeoutSec: 45 },
  });

  const outJson = path.join(getSqlDir(), "..", "scaffolds", `${id}.definition.json`);
  fs.mkdirSync(path.dirname(outJson), { recursive: true });
  fs.writeFileSync(outJson, JSON.stringify(definition, null, 2), "utf-8");

  console.log(`✅ Wrote SQL -> src/lib/reports/sql/${sqlFile}`);
  console.log(`✅ Wrote definition draft -> ${path.relative(process.cwd(), outJson)}`);
  console.log(`Detected parameters: ${params.join(", ") || "(none)"}`);
  console.log(`Next: open Report Studio (/admin/reports/new), paste definition, introspect columns, publish.`);
}

main();
