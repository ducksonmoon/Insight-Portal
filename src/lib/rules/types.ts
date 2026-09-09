/**
 * Rule engine — module-agnostic exception detection over a read-only ERP database.
 *
 * A "rule" is a named SQL probe that returns rows only when something is wrong.
 * Two libraries share the same engine:
 *   - pack "health" : data-integrity defects (run occasionally, used to prove the problem)
 *   - pack "daily"  : operational exceptions (run every morning, used to run the business)
 *
 * Adding a new module (LGS/انبار, SLS/فروش, PRC/خرید, HCM/منابع انسانی …) means
 * adding rule definitions only — the engine never changes.
 */

/**
 * Rahkaran subsystem a rule belongs to — the schema prefix without the "3".
 * Only subsystems we can actually write rules against are listed; the database
 * has 37 schemas but most are configuration or dead weight.
 */
export type RuleModule =
  | "FIN" // مالی — دفتر کل، اسناد، حساب‌ها
  | "RPA" // دریافت و پرداخت — چک، بانک، صندوق، تنخواه
  | "FSR" // صورت‌های مالی
  | "LGS" // انبار و لجستیک
  | "SLS" // فروش
  | "DSD" // پخش و توزیع مویرگی
  | "PRC" // خرید و تدارکات
  | "MMG" // برنامه‌ریزی و مدیریت تولید
  | "PAC" // حسابداری تولید
  | "MRP" // برنامه‌ریزی مواد
  | "CAC" // بهای تمام‌شده
  | "QCM" // کنترل کیفیت
  | "CMMS" // نگهداری و تعمیرات
  | "HCM" // سرمایه انسانی
  | "FAM" // دارایی ثابت
  | "XLS" // حمل و نقل
  | "BDG" // بودجه
  | "FCC" // قراردادها
  | "IPR"; // بازرگانی خارجی و واردات

export type RulePack = "health" | "daily";

/** Drives sort order and colour in the UI. */
export type RuleSeverity = "critical" | "high" | "medium" | "low";

export const SEVERITY_ORDER: Record<RuleSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export const MODULE_LABEL_FA: Record<RuleModule, string> = {
  FIN: "مالی",
  RPA: "دریافت و پرداخت",
  FSR: "صورت‌های مالی",
  LGS: "انبار",
  SLS: "فروش",
  DSD: "پخش و توزیع",
  PRC: "خرید و تدارکات",
  MMG: "برنامه‌ریزی تولید",
  PAC: "حسابداری تولید",
  MRP: "برنامه‌ریزی مواد",
  CAC: "بهای تمام‌شده",
  QCM: "کنترل کیفیت",
  CMMS: "نگهداری و تعمیرات",
  HCM: "سرمایه انسانی",
  FAM: "دارایی ثابت",
  XLS: "حمل و نقل",
  BDG: "بودجه",
  FCC: "قراردادها",
  IPR: "بازرگانی خارجی",
};

/** SQL Server schema each module lives in, for rule authoring and diagnostics. */
export const MODULE_SCHEMA: Record<RuleModule, string> = {
  FIN: "FIN3",
  RPA: "RPA3",
  FSR: "FSR3",
  LGS: "LGS3",
  SLS: "SLS3",
  DSD: "DSD3",
  PRC: "PRC3",
  MMG: "MMG3",
  PAC: "PAC3",
  MRP: "MRP3",
  CAC: "CAC3",
  QCM: "QCM3",
  CMMS: "CMMS3",
  HCM: "HCM3",
  FAM: "FAM3",
  XLS: "XLS3",
  BDG: "BDG3",
  FCC: "FCC3",
  IPR: "IPR3",
};

export const SEVERITY_LABEL_FA: Record<RuleSeverity, string> = {
  critical: "بحرانی",
  high: "مهم",
  medium: "متوسط",
  low: "کم",
};

/**
 * A tunable threshold (days, amounts, …). Values are substituted into the SQL as
 * `{{name}}` placeholders — never string-concatenated from user input, and every
 * value is coerced to a number before substitution.
 */
export interface RuleParam {
  name: string;
  labelFa: string;
  defaultValue: number;
}

/**
 * Every rule's SQL must project this exact shape so the engine and UI stay generic.
 * Extra columns are ignored.
 */
export interface RuleFindingRow extends Record<string, unknown> {
  /** Primary key of the offending record, used to de-duplicate across runs. */
  entity_id: string | number;
  /** Human-readable identity, e.g. "سند شماره ۱۲۴۰". */
  title: string;
  /** What exactly is wrong, already formatted for a Persian reader. */
  detail: string;
  /** Monetary impact when meaningful; null when the defect has no amount. */
  amount: number | null;
  /** Document/due date the finding hangs off, for ageing and sorting. */
  ref_date: Date | string | null;
}

export interface Rule {
  /** Stable dotted id, e.g. "fin.voucher.unbalanced". Never reuse across meanings. */
  id: string;
  module: RuleModule;
  pack: RulePack;
  severity: RuleSeverity;
  titleFa: string;
  /** What the rule looks for. */
  descriptionFa: string;
  /** Why a finance manager should care — this is what sells the product. */
  whyItMattersFa: string;
  /** The concrete next action, phrased for someone working inside Rahkaran. */
  fixHintFa: string;
  params?: RuleParam[];
  /**
   * "sql" (default, omit `kind` entirely) — the rule is its own read-only
   * T-SQL query against Rahkaran, exactly as every rule worked before Phase 3.
   *
   * "entity" — the rule evaluates a materialized Business Entity snapshot
   * (see src/lib/entities/) instead of querying Rahkaran directly. Requires
   * `entityKey` + `evaluate`, and `sql` is unused.
   */
  kind?: "sql" | "entity";
  /**
   * Read-only T-SQL projecting {@link RuleFindingRow}. Must never write.
   * Placeholders are `{{paramName}}`. Required when `kind` is "sql" or omitted.
   */
  sql?: string;
  /** BusinessEntityDef.key this rule reads. Required when `kind` is "entity". */
  entityKey?: string;
  /**
   * Pure function over the entity's current records (already synced fresh
   * by the engine before this runs) plus resolved numeric params, producing
   * findings the same shape a SQL rule would. Untyped records parameter is
   * deliberate — each entity has its own record shape; the rule that owns
   * `entityKey` also owns casting it correctly.
   */
  evaluate?: (records: Record<string, unknown>[], params: Record<string, number>) => RuleFindingRow[];
}

export interface RuleFinding extends RuleFindingRow {
  ruleId: string;
  module: RuleModule;
  severity: RuleSeverity;
  ruleTitleFa: string;
}

export interface RuleRunResult {
  ruleId: string;
  module: RuleModule;
  pack: RulePack;
  severity: RuleSeverity;
  titleFa: string;
  status: "ok" | "error";
  /** Number of defects found. 0 means the check passed. */
  count: number;
  /** Summed `amount` across findings, when the rule carries money. */
  totalAmount: number | null;
  durationMs: number;
  error?: string;
  findings: RuleFinding[];
}

export interface RuleRunSummary {
  runAt: Date;
  durationMs: number;
  results: RuleRunResult[];
  /** Rules that found something, worst first. */
  failed: RuleRunResult[];
  totals: {
    rulesRun: number;
    rulesFailed: number;
    findings: number;
    amountAtRisk: number;
  };
}
