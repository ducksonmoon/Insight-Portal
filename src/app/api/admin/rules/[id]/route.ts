import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/db/prisma";
import { computeNextRuleRun } from "@/lib/rules/persistence";

const patchSchema = z.object({
  isEnabled: z.boolean().optional(),
  frequency: z.enum(["hourly", "daily", "weekly"]).optional(),
  runAt: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  params: z.record(z.string(), z.number()).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const existing = await prisma.ruleDefinition.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "قانون یافت نشد" }, { status: 404 });
  }

  const json = await request.json();
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const data = parsed.data;
  const frequency = data.frequency ?? existing.frequency;
  const runAt = data.runAt ?? existing.runAt;

  const ruleDef = await prisma.ruleDefinition.update({
    where: { id },
    data: {
      ...(data.isEnabled !== undefined ? { isEnabled: data.isEnabled } : {}),
      ...(data.frequency ? { frequency: data.frequency } : {}),
      ...(data.runAt ? { runAt: data.runAt } : {}),
      ...(data.params ? { paramsJson: JSON.stringify(data.params) } : {}),
      nextRunAt: computeNextRuleRun(frequency, runAt),
    },
  });

  return NextResponse.json({ ok: true, ruleDef });
}
