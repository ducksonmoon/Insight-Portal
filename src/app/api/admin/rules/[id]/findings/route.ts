import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/db/prisma";

/** Findings for one rule. Defaults to open (new/acknowledged); ?status=resolved shows the resolved history. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const statusParam = request.nextUrl.searchParams.get("status");
  const status = statusParam === "resolved" ? ["resolved"] : ["new", "acknowledged"];

  const findings = await prisma.ruleFinding.findMany({
    where: { ruleDefId: id, status: { in: status } },
    orderBy: [{ status: "asc" }, { lastSeenAt: "desc" }],
    take: 200,
  });

  return NextResponse.json({ ok: true, findings });
}
