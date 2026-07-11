import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { buildReportPackage } from "@/lib/reports/export-package";
import {
  reportPackageFilename,
  reportPackageSchema,
} from "@/types/report-package";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: Ctx) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await context.params;
  const pkg = await buildReportPackage(id);
  if (!pkg) {
    return NextResponse.json({ error: "گزارش یافت نشد" }, { status: 404 });
  }

  const validated = reportPackageSchema.parse(pkg);
  const body = JSON.stringify(validated, null, 2);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${reportPackageFilename(id)}"`,
    },
  });
}
