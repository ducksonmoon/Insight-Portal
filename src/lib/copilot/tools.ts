/**
 * Grounded functions the copilot is allowed to call. Every number the copilot
 * shows a user must come from one of these — never from the model composing
 * its own SQL. Two sources, same philosophy:
 *
 *   - Reports (Studio / RDL-converted / code-defined) via the app's own
 *     `executeReport` engine — the exact SQL a human already wrote and ran.
 *   - Rules (the data-health / daily scan engine) — same idea, pre-verified
 *     read-only queries.
 *
 * New need for the copilot to answer? Build (or convert) a report the normal
 * way in Studio — it shows up here automatically via listReportDefinitions().
 * Nothing in this file needs to change.
 */
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
