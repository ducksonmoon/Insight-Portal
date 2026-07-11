import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/require-admin";
import { mapPool } from "@/lib/concurrency";
import { convertRdlReport } from "@/lib/reports/rdl-import";

const bodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
  moduleId: z.string().optional(),
  publish: z.boolean().optional(),
});

const CONVERT_CONCURRENCY = 3;

export async function POST(request: NextRequest) {
  const { error, session } = await requireAdmin();
  if (error) return error;

  try {
    const json = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message }, { status: 400 });
    }

    const { ids, moduleId, publish } = parsed.data;
    const results = await mapPool(ids, CONVERT_CONCURRENCY, (id) =>
      convertRdlReport(id, {
        moduleId,
        publish: publish !== false,
        userId: session?.user?.id,
      }),
    );

    const succeeded = results.filter((r) => r.ok).length;
    const failed = results.length - succeeded;

    return NextResponse.json({
      ok: true,
      total: results.length,
      succeeded,
      failed,
      results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "خطا در تبدیل دسته‌ای";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
