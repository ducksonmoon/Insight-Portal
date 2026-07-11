import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth/auth";
import { searchReports } from "@/lib/dashboard/data";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "غیرمجاز" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const limit = Math.min(30, Number(searchParams.get("limit") ?? 20));

  const results = await searchReports(session.user, q, limit);
  return NextResponse.json({ ok: true, results });
}
