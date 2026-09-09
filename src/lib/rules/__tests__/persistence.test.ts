import { describe, expect, it } from "vitest";

import { computeNextRuleRun, planFindingActions } from "@/lib/rules/persistence";

describe("planFindingActions", () => {
  it("marks findings with no existing row as new", () => {
    const plan = planFindingActions(["A", "B"], []);
    expect(plan.newEntityIds).toEqual(new Set(["A", "B"]));
    expect(plan.reopenEntityIds.size).toBe(0);
    expect(plan.refreshEntityIds.size).toBe(0);
    expect(plan.resolveEntityIds.size).toBe(0);
  });

  it("refreshes findings that are still open", () => {
    const plan = planFindingActions(["A"], [{ entityId: "A", status: "new" }]);
    expect(plan.refreshEntityIds).toEqual(new Set(["A"]));
    expect(plan.newEntityIds.size).toBe(0);
  });

  it("keeps acknowledged findings out of newEntityIds when still open", () => {
    const plan = planFindingActions(["A"], [{ entityId: "A", status: "acknowledged" }]);
    expect(plan.refreshEntityIds).toEqual(new Set(["A"]));
  });

  it("reopens a previously-resolved finding that comes back", () => {
    const plan = planFindingActions(["A"], [{ entityId: "A", status: "resolved" }]);
    expect(plan.reopenEntityIds).toEqual(new Set(["A"]));
    expect(plan.newEntityIds.size).toBe(0);
  });

  it("resolves open findings that no longer appear", () => {
    const plan = planFindingActions([], [
      { entityId: "A", status: "new" },
      { entityId: "B", status: "acknowledged" },
    ]);
    expect(plan.resolveEntityIds).toEqual(new Set(["A", "B"]));
  });

  it("leaves already-resolved rows alone when they still don't appear", () => {
    const plan = planFindingActions([], [{ entityId: "A", status: "resolved" }]);
    expect(plan.resolveEntityIds.size).toBe(0);
  });

  it("handles a mixed run: one new, one still-open, one resolved, one reopened", () => {
    const plan = planFindingActions(["new-one", "still-open", "reopened"], [
      { entityId: "still-open", status: "new" },
      { entityId: "gone-now", status: "acknowledged" },
      { entityId: "reopened", status: "resolved" },
    ]);
    expect(plan.newEntityIds).toEqual(new Set(["new-one"]));
    expect(plan.refreshEntityIds).toEqual(new Set(["still-open"]));
    expect(plan.reopenEntityIds).toEqual(new Set(["reopened"]));
    expect(plan.resolveEntityIds).toEqual(new Set(["gone-now"]));
  });
});

describe("computeNextRuleRun", () => {
  it("schedules the next hour on the hour boundary for hourly rules", () => {
    const from = new Date("2026-03-01T10:37:00");
    const next = computeNextRuleRun("hourly", "07:00", from);
    expect(next.getHours()).toBe(11);
    expect(next.getMinutes()).toBe(0);
    expect(next.getTime()).toBeGreaterThan(from.getTime());
  });

  it("schedules later today for a daily rule when the time hasn't passed yet", () => {
    const from = new Date("2026-03-01T05:00:00");
    const next = computeNextRuleRun("daily", "07:00", from);
    expect(next.getDate()).toBe(from.getDate());
    expect(next.getHours()).toBe(7);
  });

  it("rolls a daily rule to tomorrow once today's time has passed", () => {
    const from = new Date("2026-03-01T09:00:00");
    const next = computeNextRuleRun("daily", "07:00", from);
    expect(next.getDate()).toBe(from.getDate() + 1);
    expect(next.getHours()).toBe(7);
  });

  it("rolls a weekly rule forward by 7 days once today's time has passed", () => {
    const from = new Date("2026-03-01T09:00:00");
    const next = computeNextRuleRun("weekly", "07:00", from);
    expect(next.getDate()).toBe(from.getDate() + 7);
  });
});
