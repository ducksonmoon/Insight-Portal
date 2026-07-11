import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { getProviderSummaries } from "@/lib/dashboard/setup-checklist";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  return NextResponse.json({
    ok: true,
    providers: getProviderSummaries(),
  });
}

export async function POST(request: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const json = await request.json().catch(() => ({}));
  const key = typeof json.key === "string" ? json.key : "rahkaran";

  const { getDataSourceProvider } = await import("@/lib/reports/datasources");
  const provider = getDataSourceProvider(key);
  const result = await provider.testConnection();

  return NextResponse.json({
    ok: result.ok,
    key,
    message: result.message,
  });
}
