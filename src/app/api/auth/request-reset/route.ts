import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";

const bodySchema = z.object({
  username: z.string().min(1).max(64),
});

export async function POST(request: NextRequest) {
  try {
    const json = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "نام کاربری نامعتبر" }, { status: 400 });
    }

    const user = await prisma.user.findFirst({
      where: { username: parsed.data.username, isActive: true },
      select: { id: true, username: true, displayName: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "کاربر یافت نشد — ابتدا همگام‌سازی راهکاران را انجام دهید" },
        { status: 404 },
      );
    }

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "auth.password_reset_request",
        success: true,
        message: `درخواست بازیابی رمز برای ${user.username}`,
      },
    });

    return NextResponse.json({
      ok: true,
      message:
        "درخواست شما ثبت شد. مدیر سیستم رمز جدید را از بخش دسترسی‌ها تنظیم می‌کند.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "خطا";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
