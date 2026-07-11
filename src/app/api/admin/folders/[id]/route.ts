import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/db/prisma";

type Ctx = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  nameFa: z.string().min(1).max(200).optional(),
  parentFolderId: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export async function PUT(request: NextRequest, context: Ctx) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await context.params;

  try {
    const json = await request.json();
    const parsed = updateSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "ورودی نامعتبر" }, { status: 400 });
    }

    const existing = await prisma.reportFolder.findUnique({ where: { id } });
    if (!existing || !existing.isActive) {
      return NextResponse.json({ error: "پوشه یافت نشد" }, { status: 404 });
    }

    if (parsed.data.parentFolderId === id) {
      return NextResponse.json(
        { error: "پوشه نمی‌تواند والد خودش باشد" },
        { status: 400 },
      );
    }

    if (parsed.data.parentFolderId) {
      const parent = await prisma.reportFolder.findFirst({
        where: {
          id: parsed.data.parentFolderId,
          moduleId: existing.moduleId,
          isActive: true,
        },
      });
      if (!parent) {
        return NextResponse.json({ error: "پوشه والد یافت نشد" }, { status: 404 });
      }
    }

    const updated = await prisma.reportFolder.update({
      where: { id },
      data: {
        nameFa: parsed.data.nameFa,
        parentFolderId: parsed.data.parentFolderId,
        sortOrder: parsed.data.sortOrder,
      },
    });

    const mod = await prisma.reportModule.findUnique({
      where: { id: existing.moduleId },
      select: { slug: true },
    });

    return NextResponse.json({
      folder: {
        id: updated.id,
        nameFa: updated.nameFa,
        parentId: updated.parentFolderId,
        moduleId: mod?.slug,
        sortOrder: updated.sortOrder,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "خطا";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: Ctx) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await context.params;

  try {
    const existing = await prisma.reportFolder.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            reports: { where: { isActive: true } },
            childFolders: { where: { isActive: true } },
          },
        },
      },
    });
    if (!existing || !existing.isActive) {
      return NextResponse.json({ error: "پوشه یافت نشد" }, { status: 404 });
    }

    if (existing._count.childFolders > 0) {
      return NextResponse.json(
        { error: "ابتدا زیرپوشه‌ها را حذف یا منتقل کنید" },
        { status: 409 },
      );
    }

    await prisma.$transaction([
      prisma.report.updateMany({
        where: { folderId: id, isActive: true },
        data: { folderId: existing.parentFolderId },
      }),
      prisma.reportFolder.update({
        where: { id },
        data: { isActive: false },
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "خطا";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
