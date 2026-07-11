import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/db/prisma";

const widgetSchema = z.object({
  title: z.string().min(1),
  type: z.enum(["kpi", "report-link", "text", "chart", "report-pin"]),
  config: z.record(z.string(), z.unknown()),
  sortOrder: z.number().optional(),
  isActive: z.boolean().optional(),
});

export async function GET() {
  const widgets = await prisma.dashboardWidget.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json({
    ok: true,
    widgets: widgets.map((w) => ({
      ...w,
      config: JSON.parse(w.config) as Record<string, unknown>,
    })),
  });
}

export async function POST(request: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const json = await request.json();
  const parsed = widgetSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const widget = await prisma.dashboardWidget.create({
    data: {
      title: parsed.data.title,
      type: parsed.data.type,
      config: JSON.stringify(parsed.data.config),
      sortOrder: parsed.data.sortOrder ?? 0,
      isActive: parsed.data.isActive ?? true,
    },
  });

  return NextResponse.json({ ok: true, widget });
}
