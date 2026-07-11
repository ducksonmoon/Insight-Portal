import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/db/prisma";

const createSchema = z.object({
  moduleId: z.string().min(1),
  nameFa: z.string().min(1).max(200),
  parentFolderId: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export async function POST(request: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const json = await request.json();
    const parsed = createSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "ورودی نامعتبر" }, { status: 400 });
    }

    const mod = await prisma.reportModule.findFirst({
      where: {
        OR: [{ slug: parsed.data.moduleId }, { id: parsed.data.moduleId }],
        isActive: true,
      },
    });
    if (!mod) {
      return NextResponse.json({ error: "ماژول یافت نشد" }, { status: 404 });
    }

    if (parsed.data.parentFolderId) {
      const parent = await prisma.reportFolder.findFirst({
        where: {
          id: parsed.data.parentFolderId,
          moduleId: mod.id,
          isActive: true,
        },
      });
      if (!parent) {
        return NextResponse.json({ error: "پوشه والد یافت نشد" }, { status: 404 });
      }
    }

    const maxOrder = await prisma.reportFolder.aggregate({
      where: {
        moduleId: mod.id,
        parentFolderId: parsed.data.parentFolderId ?? null,
      },
      _max: { sortOrder: true },
    });

    const folder = await prisma.reportFolder.create({
      data: {
        moduleId: mod.id,
        nameFa: parsed.data.nameFa,
        parentFolderId: parsed.data.parentFolderId ?? null,
        sortOrder: parsed.data.sortOrder ?? (maxOrder._max.sortOrder ?? 0) + 1,
      },
    });

    return NextResponse.json({
      folder: {
        id: folder.id,
        nameFa: folder.nameFa,
        parentId: folder.parentFolderId,
        moduleId: mod.slug,
        sortOrder: folder.sortOrder,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "خطا";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
