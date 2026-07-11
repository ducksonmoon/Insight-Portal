import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";

import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";

const patchSchema = z.object({
  locale: z.enum(["fa", "en"]).optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "غیرمجاز" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      username: true,
      displayName: true,
      email: true,
      locale: true,
      isAdmin: true,
    },
  });

  return NextResponse.json({ ok: true, user });
}

export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "غیرمجاز" }, { status: 401 });
  }

  const json = await request.json();
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });
  if (!user) {
    return NextResponse.json({ error: "کاربر یافت نشد" }, { status: 404 });
  }

  const updates: { locale?: string; passwordHash?: string } = {};

  if (parsed.data.locale) {
    updates.locale = parsed.data.locale;
  }

  if (parsed.data.newPassword) {
    if (!user.passwordHash) {
      return NextResponse.json(
        { error: "رمز عبور محلی تنظیم نشده؛ با مدیر تماس بگیرید" },
        { status: 400 },
      );
    }
    if (!parsed.data.currentPassword) {
      return NextResponse.json(
        { error: "رمز عبور فعلی الزامی است" },
        { status: 400 },
      );
    }
    const ok = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
    if (!ok) {
      return NextResponse.json({ error: "رمز عبور فعلی نادرست است" }, { status: 400 });
    }
    updates.passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  }

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data: updates,
    select: {
      id: true,
      username: true,
      displayName: true,
      email: true,
      locale: true,
    },
  });

  return NextResponse.json({ ok: true, user: updated });
}
