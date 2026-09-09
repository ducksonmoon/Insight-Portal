/**
 * The bounded condition-tree DSL for business-user-authored (custom) rules —
 * Phase 4 of docs/architecture/management-intelligence-platform.md §7.
 *
 * Deliberately small: a condition is either a group (`all` = AND, `any` = OR,
 * nestable) or a leaf (`field`/`op`/`value`). `field` must be one of the
 * entity's declared EntityFieldDef keys — checked at save time by
 * validateCondition(), never at eval time — and `op` is one of a fixed
 * operator set. No arbitrary expressions, no cross-entity joins, no
 * string-built queries: this compiles to nothing, it just walks a record.
 * See the architecture doc for why that boundary matters — it's what makes
 * "let a business user write a rule" safe.
 */
import type { BusinessEntityDef, EntityFieldDef } from "./types";

export const CONDITION_OPS = ["eq", "ne", "lt", "lte", "gt", "gte", "in", "contains"] as const;
export type ConditionOp = (typeof CONDITION_OPS)[number];

export interface ConditionLeaf {
  field: string;
  op: ConditionOp;
  value: unknown;
}

export interface ConditionGroup {
  all?: ConditionNode[];
  any?: ConditionNode[];
}

export type ConditionNode = ConditionLeaf | ConditionGroup;

function isLeaf(node: ConditionNode): node is ConditionLeaf {
  return typeof (node as ConditionLeaf).field === "string";
}

export function evaluateCondition(node: ConditionNode, record: Record<string, unknown>): boolean {
  if (isLeaf(node)) {
    const actual = record[node.field];
    switch (node.op) {
      case "eq":
        return actual === node.value;
      case "ne":
        return actual !== node.value;
      case "lt":
        return Number(actual) < Number(node.value);
      case "lte":
        return Number(actual) <= Number(node.value);
      case "gt":
        return Number(actual) > Number(node.value);
      case "gte":
        return Number(actual) >= Number(node.value);
      case "in":
        return Array.isArray(node.value) && node.value.includes(actual);
      case "contains":
        return typeof actual === "string" && typeof node.value === "string" && actual.includes(node.value);
      default:
        return false;
    }
  }

  // Empty arrays are truthy in JS, and `[].every()` is vacuously true — guard
  // length explicitly so an empty (or malformed) group can never silently
  // match everything. A rule with no real conditions should match nothing.
  if (node.all?.length) return node.all.every((child) => evaluateCondition(child, record));
  if (node.any?.length) return node.any.some((child) => evaluateCondition(child, record));
  return false;
}

/**
 * Validates a condition tree against one entity's declared fields before it
 * is ever persisted or run — this is the actual safety boundary, not the
 * evaluator (which will happily be handed a field that doesn't exist and
 * just treat it as `undefined`).
 */
export function validateCondition(node: ConditionNode, entity: BusinessEntityDef): string[] {
  const fieldsByKey = new Map<string, EntityFieldDef>(entity.fields.map((f) => [f.key, f]));
  const errors: string[] = [];

  function walk(n: ConditionNode) {
    if (isLeaf(n)) {
      const field = fieldsByKey.get(n.field);
      if (!field) {
        errors.push(`فیلد "${n.field}" روی موجودیت "${entity.labelFa}" وجود ندارد`);
        return;
      }
      if (!CONDITION_OPS.includes(n.op)) {
        errors.push(`عملگر "${String(n.op)}" نامعتبر است`);
        return;
      }
      if (n.op === "in" && !Array.isArray(n.value)) {
        errors.push(`عملگر "in" برای فیلد "${n.field}" به یک فهرست نیاز دارد`);
      }
      return;
    }

    const children = n.all ?? n.any;
    if (!children || !children.length) {
      errors.push("گروه شرط نباید خالی باشد");
      return;
    }
    children.forEach(walk);
  }

  walk(node);
  return errors;
}
