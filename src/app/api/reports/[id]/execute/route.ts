import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth/auth";
import { canViewReport } from "@/lib/auth/access";
import { executeReport } from "@/lib/reports/engine";
import { getDataSourceProvider } from "@/lib/reports/datasources";
import { validateSubmittedParameters } from "@/lib/reports/parameter-utils";
import { getReportDefinition } from "@/lib/reports/registry";

const bodySchema = z.object({
  parameters: z.record(z.string(), z.unknown()).optional().default({}),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().optional(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const allowed = await canViewReport(session.user, id);
    if (!allowed) {
      return NextResponse.json(
        { error: "شما به این گزارش دسترسی ندارید" },
        { status: 403 },
      );
    }

    const report = await getReportDefinition(id);
    if (!report) {
      return NextResponse.json({ error: "گزارش یافت نشد" }, { status: 404 });
    }

    const provider = getDataSourceProvider(report.dataSourceId || "rahkaran");
    if (!provider.isConfigured()) {
      return NextResponse.json(
        {
          error:
            "دیتابیس پیکربندی نشده است. فایل .env.local را بررسی کنید.",
        },
        { status: 503 },
      );
    }

    const json = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "پارامترهای نامعتبر", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const paramCheck = validateSubmittedParameters(
      report.parameters,
      parsed.data.parameters ?? {},
    );
    if (!paramCheck.ok) {
      return NextResponse.json({ error: paramCheck.message }, { status: 400 });
    }

    const result = await executeReport(id, {
      parameters: parsed.data.parameters,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      userId: session.user.id,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "خطای ناشناخته";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
