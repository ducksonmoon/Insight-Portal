/**
 * Grounded functions the copilot is allowed to call. Every number the copilot
 * shows a user must come from one of these — never from the model composing
 * its own SQL. Three sources, same philosophy:
 *
 *   - Reports (Studio / RDL-converted / code-defined) via the app's own
 *     `executeReport` engine — the exact SQL a human already wrote and ran.
 *   - Rules (the data-health / daily scan engine) — same idea, pre-verified
 *     read-only queries, run live against Rahkaran.
 *   - Persisted RuleFinding / EntityRecord (Phase 1–5 of
 *     docs/architecture/management-intelligence-platform.md) — already
 *     computed by the rule engine, so these answer instantly with no live
 *     Rahkaran query at all, and can explain *why* a finding fired.
 *
 * New need for the copilot to answer? Build (or convert) a report the normal
 * way in Studio — it shows up here automatically via listReportDefinitions().
 * Nothing in this file needs to change.
 */
import { prisma } from "@/lib/db/prisma";
import { evaluateCondition, type ConditionNode } from "@/lib/entities/condition";
import { allEntities, getEntity } from "@/lib/entities/registry";
import { executeReport } from "@/lib/reports/engine";
import { getReportDefinition, listReportDefinitions } from "@/lib/reports/registry";
import { runRule } from "@/lib/rules/engine";
import { allRules, getRule } from "@/lib/rules/packs";
import { MODULE_LABEL_FA, SEVERITY_LABEL_FA } from "@/lib/rules/types";

export interface RuleSummary {
  id: string;
  module: string;
  moduleFa: string;
  severity: string;
  severityFa: string;
  titleFa: string;
  descriptionFa: string;
}

/** Static — no DB call. What the copilot tells a user when asked "what checks do you run?". */
export function listRules(): RuleSummary[] {
  return allRules.map((rule) => ({
    id: rule.id,
    module: rule.module,
    moduleFa: MODULE_LABEL_FA[rule.module],
    severity: rule.severity,
    severityFa: SEVERITY_LABEL_FA[rule.severity],
    titleFa: rule.titleFa,
    descriptionFa: rule.descriptionFa,
  }));
}

export interface RunRuleToolResult {
  ruleId: string;
  titleFa: string;
  status: "ok" | "error" | "not_found";
  count: number;
  totalAmount: number | null;
  sample: Array<{ title: string; detail: string; amount: number | null }>;
  error?: string;
}

/** Runs one named rule against the live Rahkaran connection and returns a few sample rows. */
export async function runRuleTool(ruleId: string): Promise<RunRuleToolResult> {
  const rule = getRule(ruleId);
  if (!rule) {
    return {
      ruleId,
      titleFa: ruleId,
      status: "not_found",
      count: 0,
      totalAmount: null,
      sample: [],
      error: `قانونی با شناسهٔ "${ruleId}" وجود ندارد. از list_rules برای فهرست معتبر استفاده کن.`,
    };
  }

  const result = await runRule(rule);
  return {
    ruleId: result.ruleId,
    titleFa: result.titleFa,
    status: result.status,
    count: result.count,
    totalAmount: result.totalAmount,
    error: result.error,
    sample: result.findings.slice(0, 5).map((finding) => ({
      title: finding.title,
      detail: finding.detail,
      amount: finding.amount,
    })),
  };
}

export interface ReportParamSummary {
  name: string;
  label: string;
  type: string;
  nullable?: boolean;
  options?: Array<{ value: string; label: string }>;
}

export interface ReportSummary {
  id: string;
  nameFa: string;
  moduleId: string;
  parameters: ReportParamSummary[];
}

/** Every report currently published — Studio, RDL-converted, or code-defined alike. */
export async function listReports(): Promise<ReportSummary[]> {
  const defs = await listReportDefinitions();
  return defs.map((def) => ({
    id: def.id,
    nameFa: def.nameFa,
    moduleId: def.moduleId,
    parameters: def.parameters.map((param) => ({
      name: param.name,
      label: param.label,
      type: param.type,
      nullable: param.nullable,
      options: param.options,
    })),
  }));
}

export interface RunReportToolResult {
  reportId: string;
  status: "ok" | "error" | "not_found";
  totalCount: number;
  truncated: boolean;
  columns: string[];
  sample: Array<Record<string, unknown>>;
  error?: string;
}

/**
 * Runs a published report with the given parameters through the same engine
 * the "اجرا" button in the portal uses (parameter validation, Jalali dates,
 * pagination — all reused, nothing reimplemented here).
 */
export async function runReportTool(
  reportId: string,
  parameters: Record<string, unknown>,
  userId?: string | null,
): Promise<RunReportToolResult> {
  const definition = await getReportDefinition(reportId);
  if (!definition) {
    return {
      reportId,
      status: "not_found",
      totalCount: 0,
      truncated: false,
      columns: [],
      sample: [],
      error: `گزارشی با شناسهٔ "${reportId}" وجود ندارد. از list_reports برای فهرست معتبر استفاده کن.`,
    };
  }

  try {
    const result = await executeReport(reportId, {
      parameters,
      preview: true,
      pageSize: 20,
      userId,
    });

    return {
      reportId,
      status: "ok",
      totalCount: result.totalCount,
      truncated: result.truncated,
      columns: result.columns.map((column) => column.field),
      sample: result.rows,
    };
  } catch (error) {
    return {
      reportId,
      status: "error",
      totalCount: 0,
      truncated: false,
      columns: [],
      sample: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const ALERT_SEVERITY_ORDER = ["critical", "high", "medium", "low"] as const;

export interface OpenFindingSummary {
  id: string;
  ruleDefId: string;
  ruleTitleFa: string;
  titleFa: string;
  detailFa: string;
  severity: string;
  severityFa: string;
  amount: number | null;
  status: string;
  firstSeenAt: string;
}

/**
 * Persisted open findings, worst severity first — answers "what's the
 * biggest financial risk right now?" instantly, from data the rule engine
 * already computed. Never queries Rahkaran directly.
 */
export async function listOpenFindingsTool(
  options: { severity?: string; limit?: number } = {},
): Promise<OpenFindingSummary[]> {
  const limit = Math.min(50, options.limit ?? 10);
  const severities = options.severity ? [options.severity] : ALERT_SEVERITY_ORDER;

  const results: OpenFindingSummary[] = [];
  for (const severity of severities) {
    if (results.length >= limit) break;
    const rows = await prisma.ruleFinding.findMany({
      where: { status: { in: ["new", "acknowledged"] }, severity },
      orderBy: { lastSeenAt: "desc" },
      take: limit - results.length,
      include: { ruleDef: { select: { id: true, ruleCode: true, titleFa: true } } },
    });
    results.push(
      ...rows.map((row) => {
        const predefined = getRule(row.ruleDef.ruleCode);
        return {
          id: row.id,
          ruleDefId: row.ruleDefId,
          ruleTitleFa: predefined?.titleFa ?? row.ruleDef.titleFa ?? row.ruleDef.ruleCode,
          titleFa: row.titleFa,
          detailFa: row.detailFa,
          severity: row.severity,
          severityFa: SEVERITY_LABEL_FA[row.severity as keyof typeof SEVERITY_LABEL_FA] ?? row.severity,
          amount: row.amount,
          status: row.status,
          firstSeenAt: row.firstSeenAt.toISOString(),
        };
      }),
    );
  }

  return results;
}

export interface ExplainFindingResult {
  status: "ok" | "not_found";
  finding?: OpenFindingSummary & {
    whyItMattersFa: string;
    fixHintFa: string;
    lastSeenAt: string;
    acknowledgedAt: string | null;
    resolvedAt: string | null;
  };
  error?: string;
}

/** Full context for one finding — what it is, why the rule that raised it matters, and its lifecycle so far. Answers "why did this alert fire?". */
export async function explainFindingTool(findingId: string): Promise<ExplainFindingResult> {
  const row = await prisma.ruleFinding.findUnique({
    where: { id: findingId },
    include: { ruleDef: { select: { ruleCode: true, titleFa: true } } },
  });
  if (!row) {
    return { status: "not_found", error: `یافته‌ای با شناسهٔ "${findingId}" وجود ندارد.` };
  }

  const predefined = getRule(row.ruleDef.ruleCode);

  return {
    status: "ok",
    finding: {
      id: row.id,
      ruleDefId: row.ruleDefId,
      ruleTitleFa: predefined?.titleFa ?? row.ruleDef.titleFa ?? row.ruleDef.ruleCode,
      titleFa: row.titleFa,
      detailFa: row.detailFa,
      severity: row.severity,
      severityFa: SEVERITY_LABEL_FA[row.severity as keyof typeof SEVERITY_LABEL_FA] ?? row.severity,
      amount: row.amount,
      status: row.status,
      firstSeenAt: row.firstSeenAt.toISOString(),
      lastSeenAt: row.lastSeenAt.toISOString(),
      acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      whyItMattersFa: predefined?.whyItMattersFa ?? "این قانون توسط یکی از مدیران سامانه تعریف شده است.",
      fixHintFa: predefined?.fixHintFa ?? "برای جزئیات بیشتر، این قانون را در «موتور قوانین» ببینید.",
    },
  };
}

export interface EntitySummary {
  status: "ok" | "not_found";
  entityKey?: string;
  labelFa?: string;
  recordCount?: number;
  fields?: Array<{ key: string; labelFa: string; type: string }>;
  /** Sum of every declared numeric field, so "total X" questions don't need the caller to already know which field is the amount. */
  numericTotals?: Record<string, number>;
  error?: string;
}

/**
 * A grounded snapshot of one Business Entity's materialized data — record
 * count plus the sum of every numeric field. Reads EntityRecord (already
 * synced by the rule engine), never Rahkaran directly. This is what makes
 * "what's our total outstanding receivables" answerable without a
 * hand-written report for every possible phrasing of that question.
 */
export async function entitySummaryTool(entityKey: string): Promise<EntitySummary> {
  const entity = getEntity(entityKey);
  if (!entity) {
    return {
      status: "not_found",
      error: `موجودیتی با کلید "${entityKey}" وجود ندارد. از list_entities برای فهرست معتبر استفاده کن.`,
    };
  }

  const rows = await prisma.entityRecord.findMany({ where: { entityKey }, select: { data: true } });
  const records = rows.map((row) => JSON.parse(row.data) as Record<string, unknown>);

  const numericTotals: Record<string, number> = {};
  for (const field of entity.fields) {
    if (field.type !== "number") continue;
    numericTotals[field.key] = records.reduce((sum, record) => sum + (Number(record[field.key]) || 0), 0);
  }

  return {
    status: "ok",
    entityKey: entity.key,
    labelFa: entity.labelFa,
    recordCount: records.length,
    fields: entity.fields,
    numericTotals,
  };
}

export interface EntityListItem {
  key: string;
  labelFa: string;
  fields: Array<{ key: string; labelFa: string; type: string }>;
}

/** Static — no DB call. Which Business Entities exist, for entity_summary/query_entity_records. */
export function listEntitiesTool(): EntityListItem[] {
  return allEntities.map((entity) => ({ key: entity.key, labelFa: entity.labelFa, fields: entity.fields }));
}

export interface QueryEntityRecordsResult {
  status: "ok" | "not_found";
  count?: number;
  sample?: Record<string, unknown>[];
  error?: string;
}

/**
 * Filtered records from a materialized entity, using the same condition DSL
 * the Entity Rule Builder uses (src/lib/entities/condition.ts) — bounded to
 * the entity's declared fields, never arbitrary. Lets the copilot answer
 * "which receivables are overdue by more than 30 days" without a
 * purpose-built report for every possible filter combination.
 */
export async function queryEntityRecordsTool(
  entityKey: string,
  condition: ConditionNode | undefined,
  limit = 10,
): Promise<QueryEntityRecordsResult> {
  const entity = getEntity(entityKey);
  if (!entity) {
    return { status: "not_found", error: `موجودیتی با کلید "${entityKey}" وجود ندارد.` };
  }

  const rows = await prisma.entityRecord.findMany({ where: { entityKey }, select: { data: true } });
  let records = rows.map((row) => JSON.parse(row.data) as Record<string, unknown>);
  if (condition) {
    records = records.filter((record) => evaluateCondition(condition, record));
  }

  return { status: "ok", count: records.length, sample: records.slice(0, Math.min(50, limit)) };
}
