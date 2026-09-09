/**
 * Turns a persisted "custom" RuleDefinition (business-user-authored via the
 * Entity Rule Builder — Phase 4 of
 * docs/architecture/management-intelligence-platform.md) into the same Rule
 * shape a code-defined rule has, so src/lib/rules/engine.ts's runRule() can
 * execute either kind without knowing the difference.
 */
import { evaluateCondition, type ConditionNode } from "@/lib/entities/condition";
import { getEntity } from "@/lib/entities/registry";
import type { BusinessEntityDef } from "@/lib/entities/types";
import type { Rule, RuleFindingRow, RuleSeverity } from "./types";

/** The subset of a RuleDefinition row this module needs — matches the Prisma model without importing @prisma/client's generated type here. */
export interface CustomRuleDefinitionRow {
  ruleCode: string;
  titleFa: string | null;
  entityKey: string | null;
  conditionJson: string | null;
  severity: string | null;
}

function formatFieldValue(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "number") return new Intl.NumberFormat("fa-IR").format(value);
  return String(value);
}

function toGenericFindingRow(entity: BusinessEntityDef, record: Record<string, unknown>): RuleFindingRow {
  const idValue = record[entity.idField];
  const titleValue = entity.titleField ? record[entity.titleField] : idValue;
  const detail = entity.fields.map((f) => `${f.labelFa}: ${formatFieldValue(record[f.key])}`).join(" — ");
  const amountRaw = entity.amountField ? record[entity.amountField] : null;
  const amount = amountRaw != null && Number.isFinite(Number(amountRaw)) ? Number(amountRaw) : null;
  const refDateRaw = entity.refDateField ? record[entity.refDateField] : null;

  return {
    entity_id: String(idValue),
    title: `${entity.labelFa} — ${String(titleValue ?? idValue)}`,
    detail,
    amount,
    ref_date: typeof refDateRaw === "string" ? refDateRaw : null,
  };
}

/** Returns null (never throws) when the row is missing something it needs — the caller turns that into a normal "rule errored" RuleRun, same as an unresolvable predefined rule. */
export function buildCustomRule(def: CustomRuleDefinitionRow): Rule | null {
  if (!def.entityKey || !def.conditionJson || !def.severity || !def.titleFa) return null;

  const entity = getEntity(def.entityKey);
  if (!entity) return null;

  let condition: ConditionNode;
  try {
    condition = JSON.parse(def.conditionJson) as ConditionNode;
  } catch {
    return null;
  }

  return {
    id: def.ruleCode,
    module: entity.module,
    pack: "daily",
    severity: def.severity as RuleSeverity,
    titleFa: def.titleFa,
    descriptionFa: `قانون سفارشی روی «${entity.labelFa}»`,
    whyItMattersFa: "این قانون توسط یکی از مدیران سامانه تعریف شده است.",
    fixHintFa: "برای تغییر شرط‌ها یا آستانه‌ها، این قانون را در «موتور قوانین» ویرایش کنید.",
    kind: "entity",
    entityKey: def.entityKey,
    evaluate: (records) =>
      records.filter((record) => evaluateCondition(condition, record)).map((record) => toGenericFindingRow(entity, record)),
  };
}
