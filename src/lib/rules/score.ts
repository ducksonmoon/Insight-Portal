import { SEVERITY_ORDER, type RuleRunResult, type RuleRunSummary, type RuleSeverity } from "./types";

/**
 * Data-health score, 0–100. This exists so a manager has one number to track over
 * time and compare against peers — a finding count alone ("22,906 issues") reads
 * as noise, not progress.
 *
 * Method: each severity has a per-finding penalty; penalties sum per rule and are
 * capped so a single runaway rule cannot flatten the score to zero on its own.
 * The remainder is the score. Deliberately simple and explainable — a manager must
 * be able to ask "why 41?" and get a straight answer, not a black box.
 */
const PENALTY_PER_FINDING: Record<RuleSeverity, number> = {
  critical: 3,
  high: 1.2,
  medium: 0.4,
  low: 0.15,
};

/** No single rule can cost more than this many points, however many rows it finds. */
const MAX_PENALTY_PER_RULE = 18;

export type HealthGrade = "excellent" | "good" | "fair" | "poor" | "critical";

export interface HealthScoreBreakdownItem {
  ruleId: string;
  titleFa: string;
  severity: RuleSeverity;
  count: number;
  penalty: number;
}

export interface HealthScore {
  score: number;
  grade: HealthGrade;
  gradeLabelFa: string;
  breakdown: HealthScoreBreakdownItem[];
}

export function gradeFromScore(score: number): { grade: HealthGrade; labelFa: string } {
  if (score >= 90) return { grade: "excellent", labelFa: "عالی" };
  if (score >= 75) return { grade: "good", labelFa: "خوب" };
  if (score >= 55) return { grade: "fair", labelFa: "نیازمند توجه" };
  if (score >= 35) return { grade: "poor", labelFa: "ضعیف" };
  return { grade: "critical", labelFa: "بحرانی" };
}

export function computeHealthScore(summary: RuleRunSummary): HealthScore {
  const breakdown: HealthScoreBreakdownItem[] = summary.results
    .filter((result): result is RuleRunResult & { status: "ok" } => result.status === "ok" && result.count > 0)
    .map((result) => ({
      ruleId: result.ruleId,
      titleFa: result.titleFa,
      severity: result.severity,
      count: result.count,
      penalty: Math.min(result.count * PENALTY_PER_FINDING[result.severity], MAX_PENALTY_PER_RULE),
    }))
    .sort(
      (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.penalty - a.penalty,
    );

  const totalPenalty = breakdown.reduce((sum, item) => sum + item.penalty, 0);
  const score = Math.max(0, Math.round(100 - totalPenalty));
  const { grade, labelFa } = gradeFromScore(score);

  return { score, grade, gradeLabelFa: labelFa, breakdown };
}
