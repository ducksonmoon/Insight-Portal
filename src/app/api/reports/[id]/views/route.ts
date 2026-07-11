import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";

const createSchema = z.object({
  nameFa: z.string().min(1).max(120),
  parameters: z.record(z.string(), z.unknown()),
  isDefault: z.boolean().optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "غیرمجاز" }, { status: 401 });
  }

  const { id: reportSlug } = await params;
  const views = await prisma.savedReportView.findMany({
    where: { userId: session.user.id, reportSlug },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
  });

  return NextResponse.json({
    ok: true,
    views: views.map((v) => ({
      ...v,
      parameters: JSON.parse(v.parameters) as Record<string, unknown>,
    })),
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "غیرمجاز" }, { status: 401 });
  }

  const { id: reportSlug } = await params;
  const json = await request.json();
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const { nameFa, parameters, isDefault } = parsed.data;

  if (isDefault) {
    await prisma.savedReportView.updateMany({
      where: { userId: session.user.id, reportSlug },
      data: { isDefault: false },
    });
  }

  const view = await prisma.savedReportView.create({
    data: {
      userId: session.user.id,
      reportSlug,
      nameFa,
      parameters: JSON.stringify(parameters),
      isDefault: isDefault ?? false,
    },
  });

  return NextResponse.json({
    ok: true,
    view: {
      ...view,
      parameters,
    },
  });
}
