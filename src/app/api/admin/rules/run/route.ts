import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { runEnabledRuleDefinitions } from "@/lib/rules/persistence";

/** Runs every enabled rule now — the web equivalent of `npm run scan`, persisted. */
export async function POST() {
  const { error, session } = await requireAdmin();
  if (error) return error;

  const results = await runEnabledRuleDefinitions(`manual:${session!.user!.id}`);
  return NextResponse.json({ ok: true, results });
}
