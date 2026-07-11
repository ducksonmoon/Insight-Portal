import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/db/prisma";
import { slugifyLatin } from "@/lib/reports/organization";

type Ctx = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  nameFa: z.string().min(1).max(200).optional(),
  slug: z.string().min(1).max(80).optional(),
  description: z.string().max(500).nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export async function PUT(request: NextRequest, context: Ctx) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id: slugOrId } = await context.params;

  try {
    const json = await request.json();
    const parsed = updateSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "ورودی نامعتبر" }, { status: 400 });
    }

    const existing = await prisma.reportModule.findFirst({
      where: { OR: [{ slug: slugOrId }, { id: slugOrId }] },
    });
    if (!existing) {
      return NextResponse.json({ error: "ماژول یافت نشد" }, { status: 404 });
    }

    let nextSlug = existing.slug;
    if (parsed.data.slug && parsed.data.slug !== existing.slug) {
      nextSlug = slugifyLatin(parsed.data.slug);
      const conflict = await prisma.reportModule.findUnique({
        where: { slug: nextSlug },
      });
      if (conflict && conflict.id !== existing.id) {
        return NextResponse.json(
          { error: "شناسه ماژول تکراری است" },
          { status: 409 },
        );
      }
    }

    const updated = await prisma.reportModule.update({
      where: { id: existing.id },
      data: {
        nameFa: parsed.data.nameFa,
        slug: nextSlug,
        description: parsed.data.description,
        sortOrder: parsed.data.sortOrder,
      },
    });

    return NextResponse.json({
      module: {
        id: updated.slug,
        dbId: updated.id,
        nameFa: updated.nameFa,
        description: updated.description,
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

  const { id: slugOrId } = await context.params;

  try {
    const existing = await prisma.reportModule.findFirst({
      where: { OR: [{ slug: slugOrId }, { id: slugOrId }] },
      include: {
        _count: { select: { reports: { where: { isActive: true } } } },
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "ماژول یافت نشد" }, { status: 404 });
    }

    if (existing._count.reports > 0) {
      return NextResponse.json(
        {
          error: `این ماژول ${existing._count.reports} گزارش فعال دارد. ابتدا گزارش‌ها را منتقل یا حذف کنید.`,
        },
        { status: 409 },
      );
    }

    await prisma.reportModule.update({
      where: { id: existing.id },
      data: { isActive: false },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "خطا";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
