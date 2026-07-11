import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { listLookupCatalogs } from "@/lib/reports/registry";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const catalogs = await listLookupCatalogs();
  return NextResponse.json({ catalogs });
}
