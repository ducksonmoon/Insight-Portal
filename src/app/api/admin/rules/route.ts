import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/db/prisma";
import { ensureRuleDefinitions, resolveRule } from "@/lib/rules/persistence";
import { MODULE_LABEL_FA, SEVERITY_LABEL_FA } from "@/lib/rules/types";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  await ensureRuleDefinitions();

  const defs = await prisma.ruleDefinition.findMany({ orderBy: { ruleCode: "asc" } });
  const defIds = defs.map((def) => def.id);

  const [openFindings, recentRuns] = await Promise.all([
    prisma.ruleFinding.groupBy({
      by: ["ruleDefId"],
      where: { ruleDefId: { in: defIds }, status: { in: ["new", "acknowledged"] } },
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.ruleRun.findMany({
      where: { ruleDefId: { in: defIds } },
      orderBy: { runAt: "desc" },
      take: defIds.length * 3, // enough that every def's latest run is present without an N+1
    }),
  ]);

  const openByDef = new Map(
    openFindings.map((row) => [row.ruleDefId, { count: row._count._all, amount: row._sum.amount ?? 0 }]),
  );
  const lastRunByDef = new Map<string, (typeof recentRuns)[number]>();
  for (const run of recentRuns) {
    if (!lastRunByDef.has(run.ruleDefId)) lastRunByDef.set(run.ruleDefId, run);
  }

  const rows = defs
    .map((def) => {
      const rule = resolveRule(def);
      // A predefined row whose code was removed from the pack — hidden, not
      // deleted (harmless orphan). A custom row can't hit this: it's only
      // unresolvable if its own data is corrupt, which the UI needs to show,
      // not hide — so still emit a row for it, without static rule metadata.
      if (!rule && def.kind !== "custom") return null;

      const open = openByDef.get(def.id);
      const lastRun = lastRunByDef.get(def.id);

      return {
        id: def.id,
        kind: def.kind,
        ruleCode: def.ruleCode,
        titleFa: rule?.titleFa ?? def.titleFa ?? def.ruleCode,
        descriptionFa: rule?.descriptionFa ?? "",
        whyItMattersFa: rule?.whyItMattersFa ?? "",
        fixHintFa: rule?.fixHintFa ?? "",
        module: rule?.module ?? null,
        moduleFa: rule ? MODULE_LABEL_FA[rule.module] : "قوانین سفارشی",
        pack: rule?.pack ?? "daily",
        severity: rule?.severity ?? def.severity ?? "medium",
        severityFa: rule ? SEVERITY_LABEL_FA[rule.severity] : SEVERITY_LABEL_FA[(def.severity as keyof typeof SEVERITY_LABEL_FA) ?? "medium"],
        params: rule?.params ?? [],
        paramOverrides: def.paramsJson ? (JSON.parse(def.paramsJson) as Record<string, number>) : {},
        entityKey: def.entityKey,
        condition: def.conditionJson ? JSON.parse(def.conditionJson) : null,
        isEnabled: def.isEnabled,
        frequency: def.frequency,
        runAt: def.runAt,
        lastRunAt: def.lastRunAt,
        nextRunAt: def.nextRunAt,
        openFindingCount: open?.count ?? 0,
        openAmount: open?.amount ?? 0,
        lastRun: lastRun
          ? {
              status: lastRun.status,
              findingCount: lastRun.findingCount,
              newCount: lastRun.newCount,
              resolvedCount: lastRun.resolvedCount,
              totalAmount: lastRun.totalAmount,
              runAt: lastRun.runAt,
              error: lastRun.error,
            }
          : null,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  return NextResponse.json({ ok: true, rules: rows });
}
