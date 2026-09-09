import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/db/prisma";
import { CONDITION_OPS, validateCondition, type ConditionNode } from "@/lib/entities/condition";
import { getEntity } from "@/lib/entities/registry";
import { computeNextRuleRun } from "@/lib/rules/persistence";

const conditionLeafSchema = z.object({
  field: z.string().min(1),
  op: z.enum(CONDITION_OPS),
  value: z.unknown(),
});

const conditionNodeSchema: z.ZodType<ConditionNode> = z.lazy(() =>
  z.union([
    conditionLeafSchema,
    z.object({ all: z.array(conditionNodeSchema).min(1) }),
    z.object({ any: z.array(conditionNodeSchema).min(1) }),
  ]),
);

const patchSchema = z.object({
  titleFa: z.string().min(1).max(160).optional(),
  severity: z.enum(["critical", "high", "medium", "low"]).optional(),
  condition: conditionNodeSchema.optional(),
  isEnabled: z.boolean().optional(),
  frequency: z.enum(["hourly", "daily", "weekly"]).optional(),
  runAt: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const existing = await prisma.ruleDefinition.findUnique({ where: { id } });
  if (!existing || existing.kind !== "custom") {
    return NextResponse.json({ error: "قانون سفارشی یافت نشد" }, { status: 404 });
  }

  const json = await request.json();
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const data = parsed.data;

  if (data.condition) {
    const entity = getEntity(existing.entityKey!);
    if (!entity) {
      return NextResponse.json({ error: `موجودیتی با کلید «${existing.entityKey}» یافت نشد` }, { status: 400 });
    }
    const conditionErrors = validateCondition(data.condition, entity);
    if (conditionErrors.length) {
      return NextResponse.json({ error: conditionErrors.join(" — ") }, { status: 400 });
    }
  }

  const frequency = data.frequency ?? existing.frequency;
  const runAt = data.runAt ?? existing.runAt;

  const ruleDef = await prisma.ruleDefinition.update({
    where: { id },
    data: {
      ...(data.titleFa ? { titleFa: data.titleFa } : {}),
      ...(data.severity ? { severity: data.severity } : {}),
      ...(data.condition ? { conditionJson: JSON.stringify(data.condition) } : {}),
      ...(data.isEnabled !== undefined ? { isEnabled: data.isEnabled } : {}),
      ...(data.frequency ? { frequency: data.frequency } : {}),
      ...(data.runAt ? { runAt: data.runAt } : {}),
      nextRunAt: computeNextRuleRun(frequency, runAt),
    },
  });

  return NextResponse.json({ ok: true, ruleDef });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const existing = await prisma.ruleDefinition.findUnique({ where: { id } });
  if (!existing || existing.kind !== "custom") {
    return NextResponse.json({ error: "قانون سفارشی یافت نشد" }, { status: 404 });
  }

  // Findings/runs cascade (onDelete: Cascade on both relations) — a custom
  // rule's history goes with it, unlike a predefined rule's row which is
  // never deleted at all.
  await prisma.ruleDefinition.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
