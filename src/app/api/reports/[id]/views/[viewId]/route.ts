import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";

const patchSchema = z.object({
  nameFa: z.string().min(1).max(120).optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
  isDefault: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; viewId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "غیرمجاز" }, { status: 401 });
  }

  const { id: reportSlug, viewId } = await params;
  const existing = await prisma.savedReportView.findFirst({
    where: { id: viewId, userId: session.user.id, reportSlug },
  });
  if (!existing) {
    return NextResponse.json({ error: "نما یافت نشد" }, { status: 404 });
  }

  const json = await request.json();
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  if (parsed.data.isDefault) {
    await prisma.savedReportView.updateMany({
      where: { userId: session.user.id, reportSlug },
      data: { isDefault: false },
    });
  }

  const view = await prisma.savedReportView.update({
    where: { id: viewId },
    data: {
      ...(parsed.data.nameFa ? { nameFa: parsed.data.nameFa } : {}),
      ...(parsed.data.parameters
        ? { parameters: JSON.stringify(parsed.data.parameters) }
        : {}),
      ...(parsed.data.isDefault !== undefined
        ? { isDefault: parsed.data.isDefault }
        : {}),
    },
  });

  return NextResponse.json({
    ok: true,
    view: {
      ...view,
      parameters: JSON.parse(view.parameters) as Record<string, unknown>,
    },
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; viewId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "غیرمجاز" }, { status: 401 });
  }

  const { id: reportSlug, viewId } = await params;
  const existing = await prisma.savedReportView.findFirst({
    where: { id: viewId, userId: session.user.id, reportSlug },
  });
  if (!existing) {
    return NextResponse.json({ error: "نما یافت نشد" }, { status: 404 });
  }

  await prisma.savedReportView.delete({ where: { id: viewId } });
  return NextResponse.json({ ok: true });
}
