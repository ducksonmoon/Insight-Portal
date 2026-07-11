import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/db/prisma";
import { readRdlFile } from "@/lib/reports/rdl-storage";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: Ctx) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await context.params;

  try {
    const row = await prisma.rdlReport.findFirst({
      where: { OR: [{ id }, { slug: id }], isActive: true },
    });
    if (!row) {
      return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
    }

    const xml = await readRdlFile(row.storageName);

    return new NextResponse(xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(row.originalFilename)}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "خطا";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
