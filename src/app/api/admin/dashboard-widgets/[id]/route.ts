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

const patchSchema = widgetSchema.partial();

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const json = await request.json();
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const widget = await prisma.dashboardWidget.update({
    where: { id },
    data: {
      ...(parsed.data.title ? { title: parsed.data.title } : {}),
      ...(parsed.data.type ? { type: parsed.data.type } : {}),
      ...(parsed.data.config
        ? { config: JSON.stringify(parsed.data.config) }
        : {}),
      ...(parsed.data.sortOrder !== undefined
        ? { sortOrder: parsed.data.sortOrder }
        : {}),
      ...(parsed.data.isActive !== undefined
        ? { isActive: parsed.data.isActive }
        : {}),
    },
  });

  return NextResponse.json({ ok: true, widget });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  await prisma.dashboardWidget.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
