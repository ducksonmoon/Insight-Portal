import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth/auth";
import { canExportReport } from "@/lib/auth/access";
import { buildRowsExcelBuffer } from "@/lib/reports/excel-export";
import { reportColumnSchema } from "@/types/report";

/**
 * Excel export of exactly what a single grid is currently showing — the
 * client already has these rows (they came from this same report's own
 * /execute call, itself capped by the report's maxRows), so this endpoint
 * never re-queries Rahkaran. It only turns already-fetched, already
 * permission-checked rows into a workbook. Distinct from
 * /api/reports/[id]/export, which re-runs the full report server-side and
 * exports every dataset unfiltered — this is the grid toolbar's "what I'm
 * looking at right now" export, matching the CSV button's own behavior.
 */
const bodySchema = z.object({
  sheetName: z.string().min(1).max(200),
  columns: z.array(reportColumnSchema),
  rows: z.array(z.record(z.string(), z.unknown())).max(50000),
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

    const allowed = await canExportReport(session.user, id);
    if (!allowed) {
      return NextResponse.json(
        { error: "شما اجازه خروجی این گزارش را ندارید" },
        { status: 403 },
      );
    }

    const json = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "درخواست نامعتبر" }, { status: 400 });
    }

    const buffer = await buildRowsExcelBuffer(
      parsed.data.sheetName,
      parsed.data.columns,
      parsed.data.rows,
    );

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${id}.xlsx"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "خطای ناشناخته";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
