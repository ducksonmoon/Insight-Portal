import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/db/prisma";
import { writeAuditLog } from "@/lib/reports/registry";

const patchSchema = z.object({
  status: z.enum(["acknowledged", "resolved", "new"]),
});

/**
 * Manual lifecycle transitions a human makes on a finding: acknowledge ("I've
 * seen this"), resolve ("I've handled this outside the ERP scan's view" —
 * e.g. paid the LC manually before the ledger caught up), or reopen. A
 * finding the engine still detects will flip back to "new" on the next run
 * regardless of a manual "resolved" here — this only short-circuits the
 * *current* alert state, it does not silence the rule (use RuleException for
 * that).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ findingId: string }> },
) {
  const { error, session } = await requireAdmin();
  if (error) return error;

  const { findingId } = await params;
  const existing = await prisma.ruleFinding.findUnique({ where: { id: findingId } });
  if (!existing) {
    return NextResponse.json({ error: "یافته پیدا نشد" }, { status: 404 });
  }

  const json = await request.json();
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const userId = session!.user!.id!;
  const status = parsed.data.status;
  const now = new Date();

  const finding = await prisma.ruleFinding.update({
    where: { id: findingId },
    data: {
      status,
      ...(status === "acknowledged" ? { acknowledgedAt: now, acknowledgedBy: userId } : {}),
      ...(status === "resolved" ? { resolvedAt: now, resolvedBy: userId } : {}),
      ...(status === "new" ? { resolvedAt: null, resolvedBy: null } : {}),
    },
  });

  await writeAuditLog({
    userId,
    action: `rule.finding.${status}`,
    message: `${existing.ruleDefId}::${existing.entityId}`,
  });

  return NextResponse.json({ ok: true, finding });
}
