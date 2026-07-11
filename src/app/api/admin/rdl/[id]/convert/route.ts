import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/require-admin";
import { convertRdlReport } from "@/lib/reports/rdl-import";

type Ctx = { params: Promise<{ id: string }> };

const convertSchema = z.object({
  moduleId: z.string().min(1).optional(),
  slug: z.string().optional(),
  nameFa: z.string().optional(),
  publish: z.boolean().optional(),
});

export async function POST(request: NextRequest, context: Ctx) {
  const { error, session } = await requireAdmin();
  if (error) return error;

  const { id } = await context.params;

  try {
    const json = await request.json().catch(() => ({}));
    const parsedBody = convertSchema.safeParse(json);

    const result = await convertRdlReport(id, {
      moduleId: parsedBody.success ? parsedBody.data.moduleId : undefined,
      slug: parsedBody.success ? parsedBody.data.slug : undefined,
      nameFa: parsedBody.success ? parsedBody.data.nameFa : undefined,
      publish: parsedBody.success ? parsedBody.data.publish !== false : true,
      userId: session?.user?.id,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error ?? "خطا در تبدیل" },
        { status: result.error === "گزارش RDL یافت نشد" ? 404 : 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      slug: result.reportSlug,
      editUrl: result.reportSlug
        ? `/admin/reports/${result.reportSlug}/edit`
        : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "خطا در تبدیل";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
