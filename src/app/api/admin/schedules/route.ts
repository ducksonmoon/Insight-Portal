import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/require-admin";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";

const createSchema = z.object({
  reportSlug: z.string().min(1),
  nameFa: z.string().min(1).max(120),
  frequency: z.enum(["daily", "weekly", "monthly"]).default("daily"),
  runAt: z.string().regex(/^\d{2}:\d{2}$/).default("08:00"),
  parameters: z.record(z.string(), z.unknown()).default({}),
  format: z.enum(["excel", "csv"]).default("excel"),
  recipients: z.array(z.string().email()).min(1),
  isActive: z.boolean().optional(),
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

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "غیرمجاز" }, { status: 401 });
  }

  const isAdmin = session.user.isAdmin;
  const schedules = await prisma.reportSchedule.findMany({
    where: isAdmin ? {} : { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { username: true, displayName: true } },
    },
  });

  return NextResponse.json({
    ok: true,
    schedules: schedules.map((s) => ({
      ...s,
      parameters: JSON.parse(s.parameters) as Record<string, unknown>,
      recipients: JSON.parse(s.recipients) as string[],
    })),
  });
}

export async function POST(request: NextRequest) {
  const { error, session } = await requireAdmin();
  if (error) return error;

  const json = await request.json();
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const data = parsed.data;
  const schedule = await prisma.reportSchedule.create({
    data: {
      reportSlug: data.reportSlug,
      userId: session!.user!.id!,
      nameFa: data.nameFa,
      frequency: data.frequency,
      runAt: data.runAt,
      parameters: JSON.stringify(data.parameters),
      format: data.format,
      recipients: JSON.stringify(data.recipients),
      isActive: data.isActive ?? true,
      nextRunAt: computeNextRun(data.frequency, data.runAt),
    },
  });

  return NextResponse.json({ ok: true, schedule });
}
