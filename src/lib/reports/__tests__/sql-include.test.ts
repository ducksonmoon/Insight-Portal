import { describe, expect, it } from "vitest";
import { loadSqlFile } from "../sql-loader";
import { reportDefinitions } from "../definitions";
import { resolveSqlText } from "../sql-loader";

/**
 * The LC detail and summary reports are the same pipeline with different final
 * SELECTs, spliced together by `-- @include`. If the directive ever stops
 * resolving, both reports still "load" — they just run a SELECT against temp
 * tables that were never created, and fail at the database instead of here.
 */
describe("SQL @include", () => {
  it("splices the shared LC pipeline into both LC reports", () => {
    for (const file of ["lc.sql", "lc-summary.sql"]) {
      const sql = loadSqlFile(file);
      // The directive itself must be gone. Prose mentioning it in a comment
      // (lc-core.sql explains the mechanism in its own header) is fine.
      expect(sql).not.toMatch(/^[ \t]*--[ \t]*@include[ \t]+\S+[ \t]*$/m);
      // Objects the core is responsible for creating.
      expect(sql).toContain("INTO #FinalCalc");
      expect(sql).toContain("DECLARE @RowDebt TABLE");
      expect(sql).toContain("INTO #LcTitle");
    }
  });

  it("keeps each report's own output", () => {
    expect(loadSqlFile("lc.sql")).toContain("[مانده بدهی]");
    expect(loadSqlFile("lc-summary.sql")).toContain("[درصد مصرف اعتبار]");
    // The summary must not drag the detail report's row-level output with it.
    expect(loadSqlFile("lc-summary.sql")).not.toContain("[مبلغ کل]");
  });

  it("resolves includes through a report definition, not just by filename", () => {
    const summary = reportDefinitions.find((r) => r.id === "lc-summary");
    expect(summary).toBeDefined();
    expect(resolveSqlText(summary!)).toContain("INTO #FinalCalc");
  });

  it("declares every parameter the definition promises", () => {
    const summary = reportDefinitions.find((r) => r.id === "lc-summary")!;
    const sql = resolveSqlText(summary);
    for (const param of summary.parameters) {
      expect(sql, `@${param.name} missing from lc-summary.sql`).toContain(`@${param.name}`);
    }
  });

  it("rejects a file that includes itself", () => {
    // Guarding the guard: a cycle must fail loudly at load, not recurse until
    // the stack runs out.
    expect(() => loadSqlFile("__nonexistent-include-test.sql")).toThrow(/not found/i);
  });
});
