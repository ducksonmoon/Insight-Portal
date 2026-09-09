import { prisma } from "@/lib/db/prisma";
import { SEVERITY_ORDER, type RuleRunResult, type RuleRunSummary } from "./types";

/**
 * A human decided a specific finding is not actually a defect — a legitimate
 * opening balance, an account that intentionally skips a detail level, etc.
 * Exceptions are keyed by (ruleId, entityId) so accepting one row never hides
 * the rest of that rule's genuine findings. This is the mechanism that keeps
 * the scan trustworthy over time: every rule will have some false positives on
 * a real ERP, and a manager who cannot silence them individually will stop
 * trusting — and stop opening — the whole report.
 */
export interface RuleExceptionInput {
  ruleId: string;
  entityId: string | number;
  note?: string;
  createdBy?: string;
}

export async function addException(input: RuleExceptionInput): Promise<void> {
  await prisma.ruleException.upsert({
    where: { ruleId_entityId: { ruleId: input.ruleId, entityId: String(input.entityId) } },
    create: {
      ruleId: input.ruleId,
      entityId: String(input.entityId),
      note: input.note,
      createdBy: input.createdBy,
    },
    update: {
      note: input.note,
      createdBy: input.createdBy,
    },
  });
}

export async function removeException(ruleId: string, entityId: string | number): Promise<void> {
  await prisma.ruleException.deleteMany({
    where: { ruleId, entityId: String(entityId) },
  });
}

export async function listExceptions(ruleId?: string) {
  return prisma.ruleException.findMany({
    where: ruleId ? { ruleId } : undefined,
    orderBy: { createdAt: "desc" },
  });
}

/** Set of "ruleId::entityId" keys for O(1) lookup while filtering a scan result. */
async function loadExceptionKeySet(): Promise<Set<string>> {
  const exceptions = await prisma.ruleException.findMany({ select: { ruleId: true, entityId: true } });
  return new Set(exceptions.map((exception) => `${exception.ruleId}::${exception.entityId}`));
}

/**
 * Same whitelist, applied to a single rule's findings rather than a whole
 * scan summary — what the persisted rule engine (src/lib/rules/persistence.ts)
 * uses so a whitelisted row never turns into a RuleFinding in the first place.
 */
export async function filterExceptions<T extends { entity_id: string | number }>(
  ruleId: string,
  findings: T[],
): Promise<T[]> {
  const exceptionKeys = await loadExceptionKeySet();
  if (exceptionKeys.size === 0) return findings;
  return findings.filter((finding) => !exceptionKeys.has(`${ruleId}::${finding.entity_id}`));
}

/**
 * Removes whitelisted findings from a scan summary and recomputes every total
 * (count, amount, failed list) so the report never shows a number that
 * contradicts the rows underneath it.
 */
export async function applyExceptions(summary: RuleRunSummary): Promise<RuleRunSummary> {
  const exceptionKeys = await loadExceptionKeySet();
  if (exceptionKeys.size === 0) return summary;

  const results: RuleRunResult[] = summary.results.map((result) => {
    if (result.status !== "ok" || result.findings.length === 0) return result;

    const findings = result.findings.filter(
      (finding) => !exceptionKeys.has(`${finding.ruleId}::${finding.entity_id}`),
    );
    const suppressed = result.findings.length - findings.length;
    if (suppressed === 0) return result;

    const amounts = findings
      .map((finding) => Number(finding.amount))
      .filter((value): value is number => Number.isFinite(value));

    return {
      ...result,
      count: findings.length,
      totalAmount: amounts.length ? amounts.reduce((sum, value) => sum + value, 0) : null,
      findings,
    };
  });

  const failed = results
    .filter((result) => result.count > 0)
    .sort(
      (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.count - a.count,
    );

  return {
    ...summary,
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
