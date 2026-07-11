import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const pageSize = Math.min(100, Math.max(10, Number(searchParams.get("pageSize") ?? 50)));
  const action = searchParams.get("action") ?? undefined;
  const userId = searchParams.get("userId") ?? undefined;
  const reportId = searchParams.get("reportId") ?? undefined;
  const successParam = searchParams.get("success");
  const success =
    successParam === "true" ? true : successParam === "false" ? false : undefined;

  const where = {
    ...(action ? { action } : {}),
    ...(userId ? { userId } : {}),
    ...(reportId ? { reportId } : {}),
    ...(success !== undefined ? { success } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        user: { select: { id: true, username: true, displayName: true } },
        report: { select: { id: true, slug: true, nameFa: true } },
      },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    total,
    page,
    pageSize,
    rows,
  });
}
