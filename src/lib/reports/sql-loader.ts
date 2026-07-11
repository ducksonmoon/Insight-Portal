import fs from "fs";
import path from "path";

import {
  getPrimaryDataset,
  type ReportDataset,
  type ReportDefinition,
  type ReportSqlSource,
} from "@/types/report";

const SQL_DIR = path.join(process.cwd(), "src", "lib", "reports", "sql");

export function resolveSqlSourceText(
  source: ReportSqlSource | undefined,
  fallback?: { sql?: string; sqlFile?: string; label?: string },
): string {
  if (source?.mode === "inline" && source.text) {
    return source.text;
  }

  if (source?.mode === "file" && source.path) {
    return loadSqlFile(source.path);
  }

  if (fallback?.sql) {
    return fallback.sql;
  }

  if (fallback?.sqlFile) {
    return loadSqlFile(fallback.sqlFile);
  }

  throw new Error(
    `No SQL source${fallback?.label ? ` for ${fallback.label}` : ""}`,
  );
}

export function resolveSqlText(definition: ReportDefinition): string {
  const primary = getPrimaryDataset(definition);
  return resolveSqlSourceText(primary.sqlSource ?? definition.sqlSource, {
    sql: definition.sql,
    sqlFile: definition.sqlFile,
    label: `report: ${definition.id}`,
  });
}

export function resolveDatasetSqlText(
  definition: ReportDefinition,
  dataset: ReportDataset,
): string {
  return resolveSqlSourceText(dataset.sqlSource, {
    sql:
      dataset.id === getPrimaryDataset(definition).id
        ? definition.sql
        : undefined,
    sqlFile:
      dataset.id === getPrimaryDataset(definition).id
        ? definition.sqlFile
        : undefined,
    label: `dataset ${dataset.id} in ${definition.id}`,
  });
}

export function loadSqlFile(sqlFile: string): string {
  const safe = path.basename(sqlFile);
  const filePath = path.join(SQL_DIR, safe);
  if (!fs.existsSync(filePath)) {
    throw new Error(`SQL file not found: ${safe}`);
  }
  return fs.readFileSync(filePath, "utf-8");
}

export function writeSqlFile(sqlFile: string, content: string): void {
  const safe = path.basename(sqlFile);
  if (!fs.existsSync(SQL_DIR)) {
    fs.mkdirSync(SQL_DIR, { recursive: true });
  }
  fs.writeFileSync(path.join(SQL_DIR, safe), content, "utf-8");
}

function stripSqlNoise(sqlText: string): string {
  return sqlText
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--.*$/gm, " ")
    .replace(/N?'(?:''|[^'])*'/gi, " ");
}

/**
 * Locals introduced as `DECLARE @Name` — scan whole script for DECLARE
 * statements and collect only the declared variable names (not RHS refs).
 */
export function extractDeclaredLocals(sqlText: string): Set<string> {
  const text = stripSqlNoise(sqlText);
  const locals = new Set<string>();

  // Walk every DECLARE ... ; block (non-greedy until semicolon)
  for (const m of text.matchAll(/\bDECLARE\b([\s\S]*?);/gi)) {
    const block = m[1] ?? "";
    // Split on commas that separate declarations, but keep it simple:
    // any "@Name Type" pattern at fragment start is a local.
    const fragments = block.split(",");
    for (const frag of fragments) {
      const beforeAssign = frag.split("=")[0] ?? frag;
      const nameMatch = beforeAssign.match(/@([A-Za-z_][A-Za-z0-9_]*)/);
      if (nameMatch) locals.add(nameMatch[1]);
    }
  }

  return locals;
}

const SYSTEM_VARS = new Set([
  "FETCH_STATUS",
  "ROWCOUNT",
  "IDENTITY",
  "ERROR",
  "TRANCOUNT",
  "SERVERNAME",
  "VERSION",
]);

/**
 * External input parameters = @identifiers used in SQL that are NOT
 * declared as locals and NOT @@system variables.
 */
export function extractSqlParameters(sqlText: string): string[] {
  const text = stripSqlNoise(sqlText);
  const locals = extractDeclaredLocals(sqlText);
  const names = new Set<string>();

  // Match single @ but not @@
  for (const m of text.matchAll(/(?<!@)@([A-Za-z_][A-Za-z0-9_]*)/g)) {
    const name = m[1];
    if (locals.has(name)) continue;
    if (SYSTEM_VARS.has(name.toUpperCase())) continue;
    names.add(name);
  }

  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

export function getSqlDir(): string {
  return SQL_DIR;
}
