import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/require-admin";
import { setReportPlacement } from "@/lib/reports/organization";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  moduleId: z.string().min(1),
  folderId: z.string().nullable().optional(),
});

export async function PATCH(request: NextRequest, context: Ctx) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id: reportSlug } = await context.params;

  try {
    const json = await request.json();
    const parsed = patchSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "ورودی نامعتبر" }, { status: 400 });
    }

    await setReportPlacement(
      reportSlug,
      parsed.data.moduleId,
      parsed.data.folderId ?? null,
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "خطا";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
