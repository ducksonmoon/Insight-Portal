/**
 * Web-facing layer over the rule engine (./engine.ts) — the part described as
 * "Phase 1" in docs/architecture/management-intelligence-platform.md.
 *
 * The engine already knows how to run one Rule against Rahkaran and return
 * findings. This module adds what turns that into a product feature instead
 * of a CLI script: persisted config (RuleDefinition), execution history
 * (RuleRun), and a finding lifecycle (RuleFinding: new → acknowledged →
 * resolved, reopening automatically if a resolved problem comes back).
 */
import { prisma } from "@/lib/db/prisma";
import { notifyAdmins } from "@/lib/notifications/service";
import { buildCustomRule } from "./custom";
import { runRule } from "./engine";
import { filterExceptions } from "./exceptions";
import { allRules, getRule } from "./packs";
import type { Rule, RuleFinding as EngineFinding } from "./types";

/** Predefined rules resolve from the code-defined packs; custom rules synthesize a Rule from their persisted definition (src/lib/rules/custom.ts). Same shape either way, so runRule() never needs to know which kind it got. */
export function resolveRule(ruleDef: {
  kind: string;
  ruleCode: string;
  titleFa: string | null;
  entityKey: string | null;
  conditionJson: string | null;
  severity: string | null;
}): Rule | null {
  if (ruleDef.kind === "custom") return buildCustomRule(ruleDef);
  return getRule(ruleDef.ruleCode) ?? null;
}

export type RuleFrequency = "hourly" | "daily" | "weekly";

/** Next run time for a rule schedule. Deliberately mirrors the report schedule's logic in api/admin/schedules. */
export function computeNextRuleRun(
  frequency: string,
  runAt: string,
  from: Date = new Date(),
): Date {
  if (frequency === "hourly") {
    const next = new Date(from);
    next.setMinutes(0, 0, 0);
    next.setHours(next.getHours() + 1);
    return next;
  }

  const [hh, mm] = runAt.split(":").map(Number);
  const next = new Date(from);
  next.setHours(hh ?? 7, mm ?? 0, 0, 0);
  if (next <= from) {
    if (frequency === "weekly") next.setDate(next.getDate() + 7);
    else next.setDate(next.getDate() + 1);
  }
  return next;
}

/**
 * Ensures every code-defined rule (src/lib/rules/packs) has a RuleDefinition
 * row. Idempotent, cheap (one query + createMany for the missing ones) — safe
 * to call on every admin page load, the same way ensureDefaultDashboardWidgets
 * works for the dashboard.
 */
export async function ensureRuleDefinitions(): Promise<void> {
  const existing = await prisma.ruleDefinition.findMany({ select: { ruleCode: true } });
  const known = new Set(existing.map((row) => row.ruleCode));
  const missing = allRules.filter((rule) => !known.has(rule.id));
  if (!missing.length) return;

  await prisma.ruleDefinition.createMany({
    data: missing.map((rule) => ({
      ruleCode: rule.id,
      isEnabled: true,
      frequency: "daily",
      runAt: "07:00",
    })),
  });
}

/**
 * Pure planning step for the finding-lifecycle diff: given the entity ids a
 * rule found *this run* and the entity ids it has an open-or-resolved
 * RuleFinding row for already, decide which rows are brand new, which
 * reopen a previously-resolved problem, which just get their snapshot
 * refreshed, and which should now resolve because they stopped appearing.
 *
 * Extracted as a pure function so the lifecycle logic is unit-testable
 * without a database.
 */
export interface ExistingFindingRow {
  entityId: string;
  status: "new" | "acknowledged" | "resolved";
}

export interface FindingActionPlan {
  newEntityIds: Set<string>;
  reopenEntityIds: Set<string>;
  refreshEntityIds: Set<string>;
  resolveEntityIds: Set<string>;
}

export function planFindingActions(
  currentEntityIds: Iterable<string>,
  existingRows: ExistingFindingRow[],
): FindingActionPlan {
  const current = new Set(currentEntityIds);
  const existingByEntity = new Map(existingRows.map((row) => [row.entityId, row.status]));

  const newEntityIds = new Set<string>();
  const reopenEntityIds = new Set<string>();
  const refreshEntityIds = new Set<string>();

  for (const entityId of current) {
    const status = existingByEntity.get(entityId);
    if (!status) newEntityIds.add(entityId);
    else if (status === "resolved") reopenEntityIds.add(entityId);
    else refreshEntityIds.add(entityId);
  }

  const resolveEntityIds = new Set<string>();
  for (const row of existingRows) {
    if (row.status === "resolved") continue;
    if (!current.has(row.entityId)) resolveEntityIds.add(row.entityId);
  }

  return { newEntityIds, reopenEntityIds, refreshEntityIds, resolveEntityIds };
}

export interface RunRuleDefinitionResult {
  status: "ok" | "error";
  findingCount: number;
  newCount: number;
  resolvedCount: number;
  totalAmount: number | null;
  durationMs: number;
  error?: string;
}

/**
 * Runs one persisted rule definition: executes its SQL, applies the
 * exception whitelist, reconciles RuleFinding rows against the plan from
 * planFindingActions(), and writes a RuleRun history row. Never throws —
 * failures are captured in the returned result and in RuleRun.error, the
 * same way a bad rule shows "error" in `npm run scan` instead of crashing it.
 */
export async function runRuleDefinition(
  ruleDefId: string,
  triggeredBy: string,
): Promise<RunRuleDefinitionResult> {
  const startedAt = Date.now();
  const ruleDef = await prisma.ruleDefinition.findUnique({ where: { id: ruleDefId } });
  if (!ruleDef) {
    throw new Error(`RuleDefinition ${ruleDefId} not found`);
  }

  const rule = resolveRule(ruleDef);
  if (!rule) {
    const durationMs = Date.now() - startedAt;
    const error =
      ruleDef.kind === "custom"
        ? `تعریف قانون سفارشی «${ruleDef.titleFa ?? ruleDef.ruleCode}» ناقص یا نامعتبر است`
        : `کد قانون "${ruleDef.ruleCode}" دیگر در پکیج قوانین وجود ندارد`;
    await prisma.ruleRun.create({
      data: { ruleDefId, durationMs, status: "error", error, triggeredBy },
    });
    // Still advance the schedule — otherwise a stale rule (removed from the
    // pack but still enabled) gets re-picked-up by every cron tick forever.
    await prisma.ruleDefinition.update({
      where: { id: ruleDefId },
      data: { lastRunAt: new Date(), nextRunAt: computeNextRuleRun(ruleDef.frequency, ruleDef.runAt) },
    });
    return { status: "error", findingCount: 0, newCount: 0, resolvedCount: 0, totalAmount: null, durationMs, error };
  }

  const overrides = ruleDef.paramsJson
    ? (JSON.parse(ruleDef.paramsJson) as Record<string, number>)
    : {};

  const result = await runRule(rule, overrides);

  if (result.status === "error") {
    const durationMs = Date.now() - startedAt;
    await prisma.ruleRun.create({
      data: {
        ruleDefId,
        durationMs,
        status: "error",
        error: result.error,
        triggeredBy,
      },
    });
    await prisma.ruleDefinition.update({
      where: { id: ruleDefId },
      data: { lastRunAt: new Date(), nextRunAt: computeNextRuleRun(ruleDef.frequency, ruleDef.runAt) },
    });
    return {
      status: "error",
      findingCount: 0,
      newCount: 0,
      resolvedCount: 0,
      totalAmount: null,
      durationMs,
      error: result.error,
    };
  }

  const findings = await filterExceptions(rule.id, result.findings);
  const { newCount, resolvedCount } = await reconcileFindings(ruleDefId, rule, findings);

  const amounts = findings
    .map((finding) => Number(finding.amount))
    .filter((value): value is number => Number.isFinite(value));
  const totalAmount = amounts.length ? amounts.reduce((sum, value) => sum + value, 0) : null;
  const durationMs = Date.now() - startedAt;

  await prisma.ruleRun.create({
    data: {
      ruleDefId,
      durationMs,
      status: "ok",
      findingCount: findings.length,
      newCount,
      resolvedCount,
      totalAmount,
      triggeredBy,
    },
  });

  await prisma.ruleDefinition.update({
    where: { id: ruleDefId },
    data: { lastRunAt: new Date(), nextRunAt: computeNextRuleRun(ruleDef.frequency, ruleDef.runAt) },
  });

  return { status: "ok", findingCount: findings.length, newCount, resolvedCount, totalAmount, durationMs };
}

async function reconcileFindings(
  ruleDefId: string,
  rule: Rule,
  findings: EngineFinding[],
): Promise<{ newCount: number; resolvedCount: number }> {
  const existingRows = await prisma.ruleFinding.findMany({
    where: { ruleDefId },
    select: { entityId: true, status: true },
  });

  const plan = planFindingActions(
    findings.map((finding) => String(finding.entity_id)),
    existingRows as ExistingFindingRow[],
  );

  const byEntityId = new Map(findings.map((finding) => [String(finding.entity_id), finding]));

  for (const entityId of plan.newEntityIds) {
    const finding = byEntityId.get(entityId)!;
    await prisma.ruleFinding.create({
      data: {
        ruleDefId,
        entityId,
        status: "new",
        severity: rule.severity,
        titleFa: finding.title,
        detailFa: finding.detail,
        amount: finding.amount != null ? Number(finding.amount) : null,
        refDate: finding.ref_date ? new Date(finding.ref_date) : null,
      },
    });
  }

  for (const entityId of plan.reopenEntityIds) {
    const finding = byEntityId.get(entityId)!;
    await prisma.ruleFinding.update({
      where: { ruleDefId_entityId: { ruleDefId, entityId } },
      data: {
        status: "new",
        titleFa: finding.title,
        detailFa: finding.detail,
        amount: finding.amount != null ? Number(finding.amount) : null,
        refDate: finding.ref_date ? new Date(finding.ref_date) : null,
        resolvedAt: null,
        resolvedBy: null,
      },
    });
  }

  for (const entityId of plan.refreshEntityIds) {
    const finding = byEntityId.get(entityId)!;
    await prisma.ruleFinding.update({
      where: { ruleDefId_entityId: { ruleDefId, entityId } },
      data: {
        titleFa: finding.title,
        detailFa: finding.detail,
        amount: finding.amount != null ? Number(finding.amount) : null,
        refDate: finding.ref_date ? new Date(finding.ref_date) : null,
      },
    });
  }

  for (const entityId of plan.resolveEntityIds) {
    await prisma.ruleFinding.update({
      where: { ruleDefId_entityId: { ruleDefId, entityId } },
      data: { status: "resolved", resolvedAt: new Date(), resolvedBy: null },
    });
  }

  // Notify on anything that just became worth looking at — brand new, or a
  // previously-resolved problem that came back. Not on refreshEntityIds:
  // those were already open and already notified about, re-alerting on
  // every single scheduled run would train admins to ignore the bell.
  const toNotify = [...plan.newEntityIds, ...plan.reopenEntityIds];
  if (toNotify.length) {
    await notifyAdmins(
      toNotify.map((entityId) => {
        const finding = byEntityId.get(entityId)!;
        return {
          severity: rule.severity,
          title: finding.title,
          body: `${rule.titleFa}: ${finding.detail}`,
          sourceType: "rule_finding",
          sourceId: entityId,
          linkHref: `/admin/rules?rule=${ruleDefId}`,
        };
      }),
    );
  }

  return { newCount: plan.newEntityIds.size, resolvedCount: plan.resolveEntityIds.size };
}

/**
 * How many rules may query Rahkaran at the same time. The connection pool
 * (src/lib/db/rahkaran.ts) allows up to 10, so this is well inside capacity —
 * fully sequential (the original design) turned out to be needlessly slow in
 * practice for a batch of a dozen-plus rules against real ledger tables,
 * with no corresponding safety benefit for a handful of bounded, read-only
 * SELECTs. Keep this modest rather than raising it to "as many as possible":
 * the point is "don't queue behind each other one at a time", not "hit the
 * production box with everything at once".
 */
const RULE_RUN_CONCURRENCY = 3;

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Runs every enabled RuleDefinition, up to RULE_RUN_CONCURRENCY at a time. */
export async function runEnabledRuleDefinitions(
  triggeredBy: string,
): Promise<Array<{ ruleDefId: string; ruleCode: string } & RunRuleDefinitionResult>> {
  await ensureRuleDefinitions();
  const defs = await prisma.ruleDefinition.findMany({ where: { isEnabled: true } });

  return runWithConcurrency(defs, RULE_RUN_CONCURRENCY, async (def) => {
    const result = await runRuleDefinition(def.id, triggeredBy);
    return { ruleDefId: def.id, ruleCode: def.ruleCode, ...result };
  });
}

/** Runs every enabled RuleDefinition whose nextRunAt is due — what the cron script calls. */
export async function runDueRuleDefinitions(): Promise<
  Array<{ ruleDefId: string; ruleCode: string } & RunRuleDefinitionResult>
> {
  await ensureRuleDefinitions();
  const now = new Date();
  const due = await prisma.ruleDefinition.findMany({
    where: {
      isEnabled: true,
      OR: [{ nextRunAt: null }, { nextRunAt: { lte: now } }],
    },
  });

  return runWithConcurrency(due, RULE_RUN_CONCURRENCY, async (def) => {
    const result = await runRuleDefinition(def.id, "schedule");
    return { ruleDefId: def.id, ruleCode: def.ruleCode, ...result };
  });
}
