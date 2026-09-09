/**
 * Business Entity layer — Phase 3 of
 * docs/architecture/management-intelligence-platform.md.
 *
 * A Business Entity is a config-driven, named, typed projection of ERP data
 * into the app database, refreshed on demand. Not a live query pass-through
 * and not a generic "define any object" framework — a single read-only
 * SELECT (developer-authored, same trust level as a Rule's SQL) plus a
 * stable identity field. See §5 of the architecture doc for why this stays
 * narrow: model an entity when a real rule needs it, not speculatively.
 */
import type { RuleModule } from "@/lib/rules/types";

export type EntityFieldType = "number" | "string" | "date" | "boolean";

/** One field a Business Entity exposes to rules and the rule builder UI — the whitelist that keeps the condition DSL (src/lib/entities/condition.ts) bounded instead of an open door onto arbitrary data. */
export interface EntityFieldDef {
  key: string;
  labelFa: string;
  type: EntityFieldType;
}

export interface BusinessEntityDef<T extends Record<string, unknown> = Record<string, unknown>> {
  /** Stable dotted-free id, e.g. "Receivable". Used as EntityRecord.entityKey. */
  key: string;
  labelFa: string;
  /**
   * One read-only SELECT against Rahkaran. Must never write. Field names in
   * the result become the keys of T — keep them stable, rules depend on them.
   */
  sourceSql: string;
  /** Which field of T uniquely identifies a row across syncs (materialization identity, not necessarily the ERP's own PK type). */
  idField: keyof T & string;
  /** Which Rahkaran-facing module this entity belongs to — custom rules built on it group under the same module as the predefined rules that share its data. */
  module: RuleModule;
  /** Every field a custom (business-user-authored) rule is allowed to condition on. */
  fields: EntityFieldDef[];
  /** Field to summarize in a generic (custom-rule) finding's title, alongside the entity's own label. Defaults to idField. */
  titleField?: keyof T & string;
  /** Field to use as a generic finding's monetary amount, when the entity has one. */
  amountField?: keyof T & string;
  /** Field to use as a generic finding's reference date, when the entity has one. */
  refDateField?: keyof T & string;
}
