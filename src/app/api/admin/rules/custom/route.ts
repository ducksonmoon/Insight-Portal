import { randomUUID } from "crypto";
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

const createSchema = z.object({
  entityKey: z.string().min(1),
  titleFa: z.string().min(1).max(160),
  severity: z.enum(["critical", "high", "medium", "low"]),
  condition: conditionNodeSchema,
  frequency: z.enum(["hourly", "daily", "weekly"]).default("daily"),
  runAt: z.string().regex(/^\d{2}:\d{2}$/).default("07:00"),
});

export async function POST(request: NextRequest) {
  const { error, session } = await requireAdmin();
  if (error) return error;

  const json = await request.json();
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const data = parsed.data;
  const entity = getEntity(data.entityKey);
  if (!entity) {
    return NextResponse.json({ error: `موجودیتی با کلید «${data.entityKey}» یافت نشد` }, { status: 400 });
  }

  const conditionErrors = validateCondition(data.condition, entity);
  if (conditionErrors.length) {
    return NextResponse.json({ error: conditionErrors.join(" — ") }, { status: 400 });
  }

  const ruleDef = await prisma.ruleDefinition.create({
    data: {
      kind: "custom",
      ruleCode: `custom.${randomUUID()}`,
      titleFa: data.titleFa,
      entityKey: data.entityKey,
      conditionJson: JSON.stringify(data.condition),
      severity: data.severity,
      createdBy: session!.user!.id,
      frequency: data.frequency,
      runAt: data.runAt,
      nextRunAt: computeNextRuleRun(data.frequency, data.runAt),
    },
  });

  return NextResponse.json({ ok: true, ruleDef });
}
