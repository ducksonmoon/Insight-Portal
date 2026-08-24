import { queryRahkaran } from "@/lib/db/rahkaran";
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
 * Substitute `{{param}}` placeholders. Every value is coerced to a finite number,
 * so a rule's SQL can never be shaped by arbitrary text.
 */
export function renderSql(rule: Rule, overrides: Record<string, number> = {}): string {
  let sql = rule.sql;

  for (const param of rule.params ?? []) {
    const raw = overrides[param.name] ?? param.defaultValue;
    const value = Number(raw);

    if (!Number.isFinite(value)) {
      throw new Error(
        `Rule ${rule.id}: parameter "${param.name}" must be numeric, got ${String(raw)}`,
      );
    }

    sql = sql.replaceAll(`{{${param.name}}}`, String(value));
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
    const sql = renderSql(rule, overrides);
    assertReadOnly(rule, sql);

    const rows = await queryRahkaran<RuleFindingRow>(sql);
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
