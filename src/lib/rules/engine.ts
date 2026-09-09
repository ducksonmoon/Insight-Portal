import { queryRahkaran } from "@/lib/db/rahkaran";
import { getEntity } from "@/lib/entities/registry";
import { loadEntityRecords, syncEntity } from "@/lib/entities/sync";
import {
  SEVERITY_ORDER,
  type Rule,
  type RuleFinding,
  type RuleFindingRow,
  type RulePack,
  type RuleModule,
  type RuleRunResult,
  type RuleRunSummary,
} from "./types";

/** Hard cap so a badly-scoped rule can never pull a million rows into memory. */
const MAX_FINDINGS_PER_RULE = 500;

/**
 * Every value is coerced to a finite number, so neither a SQL rule's
 * placeholders nor an entity rule's evaluate() can ever be shaped by
 * arbitrary text — same discipline, shared by both execution paths.
 */
export function resolveNumericParams(
  rule: Rule,
  overrides: Record<string, number> = {},
): Record<string, number> {
  const resolved: Record<string, number> = {};

  for (const param of rule.params ?? []) {
    const raw = overrides[param.name] ?? param.defaultValue;
    const value = Number(raw);

    if (!Number.isFinite(value)) {
      throw new Error(
        `Rule ${rule.id}: parameter "${param.name}" must be numeric, got ${String(raw)}`,
      );
    }

    resolved[param.name] = value;
  }

  return resolved;
}

/** Substitute `{{param}}` placeholders using already-validated numeric params. */
export function renderSql(rule: Rule, overrides: Record<string, number> = {}): string {
  if (!rule.sql) {
    throw new Error(`Rule ${rule.id}: kind "sql" requires a sql string`);
  }

  const resolved = resolveNumericParams(rule, overrides);
  let sql: string = rule.sql;

  for (const [name, value] of Object.entries(resolved)) {
    sql = sql.replaceAll(`{{${name}}}`, String(value));
  }

  const leftover = sql.match(/\{\{(\w+)\}\}/);
  if (leftover) {
    throw new Error(`Rule ${rule.id}: no value supplied for "${leftover[1]}"`);
  }

  return sql;
}

/** Refuse anything that is not a read. The engine must never mutate Rahkaran. */
function assertReadOnly(rule: Rule, sql: string): void {
  const forbidden =
    /\b(insert|update|delete|merge|drop|alter|truncate|exec|execute|create)\b/i;

  if (forbidden.test(sql)) {
    throw new Error(`Rule ${rule.id}: only read-only SELECT statements are allowed`);
  }
}

async function runSqlRule(rule: Rule, overrides: Record<string, number>): Promise<RuleFindingRow[]> {
  const sql = renderSql(rule, overrides);
  assertReadOnly(rule, sql);
  return queryRahkaran<RuleFindingRow>(sql);
}

/** Syncs the rule's entity fresh, then evaluates it — see src/lib/entities/. */
async function runEntityRule(rule: Rule, overrides: Record<string, number>): Promise<RuleFindingRow[]> {
  if (!rule.entityKey || !rule.evaluate) {
    throw new Error(`Rule ${rule.id}: kind "entity" requires entityKey and evaluate`);
  }

  const entity = getEntity(rule.entityKey);
  if (!entity) {
    throw new Error(`Rule ${rule.id}: unknown entity "${rule.entityKey}"`);
  }

  await syncEntity(entity);
  const records = await loadEntityRecords(rule.entityKey);
  const params = resolveNumericParams(rule, overrides);
  return rule.evaluate(records, params);
}

function toFinding(rule: Rule, row: RuleFindingRow): RuleFinding {
  return {
    ...row,
    ruleId: rule.id,
    module: rule.module,
    severity: rule.severity,
    ruleTitleFa: rule.titleFa,
  };
}

export async function runRule(
  rule: Rule,
  overrides: Record<string, number> = {},
): Promise<RuleRunResult> {
  const startedAt = Date.now();

  const base: Omit<RuleRunResult, "status" | "count" | "totalAmount" | "durationMs" | "findings"> =
    {
      ruleId: rule.id,
      module: rule.module,
      pack: rule.pack,
      severity: rule.severity,
      titleFa: rule.titleFa,
    };

  try {
    const rows = rule.kind === "entity" ? await runEntityRule(rule, overrides) : await runSqlRule(rule, overrides);
    const findings = rows.slice(0, MAX_FINDINGS_PER_RULE).map((row) => toFinding(rule, row));

    const amounts = rows
      .map((row) => Number(row.amount))
      .filter((value): value is number => Number.isFinite(value));

    return {
      ...base,
      status: "ok",
      count: rows.length,
      totalAmount: amounts.length ? amounts.reduce((sum, value) => sum + value, 0) : null,
      durationMs: Date.now() - startedAt,
      findings,
    };
  } catch (error) {
    return {
      ...base,
      status: "error",
      count: 0,
      totalAmount: null,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
      findings: [],
    };
  }
}

export interface RunRulesOptions {
  pack?: RulePack;
  modules?: RuleModule[];
  /** Per-rule parameter overrides, keyed by rule id. */
  params?: Record<string, Record<string, number>>;
}

/**
 * Run a set of rules sequentially. Sequential is deliberate: these queries scan
 * large ledger tables on a production ERP box, and a read-only guest has no
 * business saturating it.
 */
export async function runRules(
  rules: Rule[],
  options: RunRulesOptions = {},
): Promise<RuleRunSummary> {
  const startedAt = Date.now();

  const selected = rules.filter((rule) => {
    if (options.pack && rule.pack !== options.pack) return false;
    if (options.modules && !options.modules.includes(rule.module)) return false;
    return true;
  });

  const results: RuleRunResult[] = [];
  for (const rule of selected) {
    results.push(await runRule(rule, options.params?.[rule.id]));
  }

  const failed = results
    .filter((result) => result.count > 0)
    .sort(
      (a, b) =>
        SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.count - a.count,
    );

  return {
    runAt: new Date(startedAt),
    durationMs: Date.now() - startedAt,
    results,
    failed,
    totals: {
      rulesRun: results.length,
      rulesFailed: failed.length,
      findings: results.reduce((sum, result) => sum + result.count, 0),
      amountAtRisk: results.reduce((sum, result) => sum + Math.abs(result.totalAmount ?? 0), 0),
    },
  };
}
