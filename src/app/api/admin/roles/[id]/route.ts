import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/db/prisma";

const patchSchema = z.object({
  nameFa: z.string().min(1).max(120).optional(),
  slug: z.string().min(1).max(60).optional(),
});

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

  const role = await prisma.role.update({
    where: { id },
    data: parsed.data,
  });

  return NextResponse.json({ ok: true, role });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const counts = await prisma.role.findUnique({
    where: { id },
    include: { _count: { select: { users: true } } },
  });
  if (!counts) {
    return NextResponse.json({ error: "نقش یافت نشد" }, { status: 404 });
  }
  if (counts._count.users > 0) {
    return NextResponse.json(
      { error: "نقش به کاربران اختصاص دارد؛ ابتدا کاربران را جدا کنید" },
      { status: 400 },
    );
  }

  await prisma.role.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
