import { describe, expect, it } from "vitest";

import { evaluateCondition, validateCondition, type ConditionNode } from "@/lib/entities/condition";
import type { BusinessEntityDef } from "@/lib/entities/types";

const entity: BusinessEntityDef = {
  key: "Receivable",
  labelFa: "چک دریافتنی باز",
  idField: "externalId",
  module: "RPA",
  sourceSql: "SELECT 1",
  fields: [
    { key: "daysUntilDue", labelFa: "روز تا سررسید", type: "number" },
    { key: "amount", labelFa: "مبلغ", type: "number" },
    { key: "counterpartName", labelFa: "طرف‌حساب", type: "string" },
  ],
};

describe("evaluateCondition", () => {
  it("evaluates a single leaf", () => {
    expect(evaluateCondition({ field: "daysUntilDue", op: "lt", value: 0 }, { daysUntilDue: -3 })).toBe(true);
    expect(evaluateCondition({ field: "daysUntilDue", op: "lt", value: 0 }, { daysUntilDue: 3 })).toBe(false);
  });

  it("ANDs an `all` group", () => {
    const node: ConditionNode = {
      all: [
        { field: "daysUntilDue", op: "gte", value: 0 },
        { field: "daysUntilDue", op: "lte", value: 7 },
      ],
    };
    expect(evaluateCondition(node, { daysUntilDue: 3 })).toBe(true);
    expect(evaluateCondition(node, { daysUntilDue: 10 })).toBe(false);
  });

  it("ORs an `any` group", () => {
    const node: ConditionNode = {
      any: [
        { field: "counterpartName", op: "eq", value: "A" },
        { field: "counterpartName", op: "eq", value: "B" },
      ],
    };
    expect(evaluateCondition(node, { counterpartName: "B" })).toBe(true);
    expect(evaluateCondition(node, { counterpartName: "C" })).toBe(false);
  });

  it("nests groups", () => {
    const node: ConditionNode = {
      all: [
        { field: "amount", op: "gt", value: 1000 },
        { any: [{ field: "daysUntilDue", op: "lt", value: 0 }, { field: "daysUntilDue", op: "gt", value: 30 }] },
      ],
    };
    expect(evaluateCondition(node, { amount: 2000, daysUntilDue: -1 })).toBe(true);
    expect(evaluateCondition(node, { amount: 2000, daysUntilDue: 5 })).toBe(false);
    expect(evaluateCondition(node, { amount: 500, daysUntilDue: -1 })).toBe(false);
  });

  it("treats an empty group as never matching", () => {
    expect(evaluateCondition({ all: [] }, { anything: 1 })).toBe(false);
  });

  it("supports in and contains", () => {
    expect(evaluateCondition({ field: "counterpartName", op: "in", value: ["A", "B"] }, { counterpartName: "B" })).toBe(true);
    expect(evaluateCondition({ field: "counterpartName", op: "contains", value: "شرکت" }, { counterpartName: "شرکت نمونه" })).toBe(true);
    expect(evaluateCondition({ field: "counterpartName", op: "contains", value: "شرکت" }, { counterpartName: "بانک ملی" })).toBe(false);
  });
});

describe("validateCondition", () => {
  it("accepts a condition over declared fields", () => {
    expect(validateCondition({ field: "amount", op: "gt", value: 0 }, entity)).toEqual([]);
  });

  it("rejects an undeclared field", () => {
    const errors = validateCondition({ field: "noSuchField", op: "eq", value: 1 }, entity);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects an empty group", () => {
    const errors = validateCondition({ all: [] }, entity);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects `in` with a non-array value", () => {
    const errors = validateCondition({ field: "amount", op: "in", value: 5 }, entity);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("walks nested groups and reports every bad leaf", () => {
    const node: ConditionNode = {
      all: [
        { field: "amount", op: "gt", value: 0 },
        { any: [{ field: "bogus", op: "eq", value: 1 }] },
      ],
    };
    expect(validateCondition(node, entity)).toHaveLength(1);
  });
});
