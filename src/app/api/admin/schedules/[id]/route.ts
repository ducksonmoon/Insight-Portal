import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/db/prisma";

const patchSchema = z.object({
  nameFa: z.string().min(1).max(120).optional(),
  frequency: z.enum(["daily", "weekly", "monthly"]).optional(),
  runAt: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
  format: z.enum(["excel", "csv"]).optional(),
  recipients: z.array(z.string().email()).optional(),
  isActive: z.boolean().optional(),
  reportSlug: z.string().min(1).optional(),
});

function computeNextRun(frequency: string, runAt: string): Date {
  const [hh, mm] = runAt.split(":").map(Number);
  const next = new Date();
  next.setHours(hh ?? 8, mm ?? 0, 0, 0);
  if (next <= new Date()) {
    if (frequency === "weekly") next.setDate(next.getDate() + 7);
    else if (frequency === "monthly") next.setMonth(next.getMonth() + 1);
    else next.setDate(next.getDate() + 1);
  }
  return next;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const existing = await prisma.reportSchedule.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "زمان‌بندی یافت نشد" }, { status: 404 });
  }

  const json = await request.json();
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const data = parsed.data;
  const frequency = data.frequency ?? existing.frequency;
  const runAt = data.runAt ?? existing.runAt;

  const schedule = await prisma.reportSchedule.update({
    where: { id },
    data: {
      ...(data.nameFa ? { nameFa: data.nameFa } : {}),
      ...(data.reportSlug ? { reportSlug: data.reportSlug } : {}),
      ...(data.frequency ? { frequency: data.frequency } : {}),
      ...(data.runAt ? { runAt: data.runAt } : {}),
      ...(data.format ? { format: data.format } : {}),
      ...(data.parameters
        ? { parameters: JSON.stringify(data.parameters) }
        : {}),
      ...(data.recipients
        ? { recipients: JSON.stringify(data.recipients) }
        : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      nextRunAt: computeNextRun(frequency, runAt),
    },
  });

  return NextResponse.json({ ok: true, schedule });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  await prisma.reportSchedule.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
