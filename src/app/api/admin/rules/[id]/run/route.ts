import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/db/prisma";
import { runRuleDefinition } from "@/lib/rules/persistence";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error, session } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const existing = await prisma.ruleDefinition.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "قانون یافت نشد" }, { status: 404 });
  }

  const result = await runRuleDefinition(id, `manual:${session!.user!.id}`);
  return NextResponse.json({ ok: true, result });
}
