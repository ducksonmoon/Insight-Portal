import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/db/prisma";
import {
  loadReportOrganization,
  listModulesFromDb,
  slugifyLatin,
} from "@/lib/reports/organization";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const [modules, organization] = await Promise.all([
    listModulesFromDb(),
    loadReportOrganization(),
  ]);

  return NextResponse.json({
    modules: modules.map((m) => ({
      id: m.slug,
      dbId: m.id.startsWith("static-") ? null : m.id,
      nameFa: m.nameFa,
      description: m.description,
      sortOrder: m.sortOrder,
    })),
    organization,
  });
}

const createSchema = z.object({
  nameFa: z.string().min(1).max(200),
  slug: z.string().min(1).max(80).optional(),
  description: z.string().max(500).optional(),
  sortOrder: z.number().int().optional(),
});

export async function POST(request: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const json = await request.json();
    const parsed = createSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "ورودی نامعتبر" }, { status: 400 });
    }

    const slug = parsed.data.slug
      ? slugifyLatin(parsed.data.slug)
      : slugifyLatin(parsed.data.nameFa);

    const existing = await prisma.reportModule.findUnique({ where: { slug } });
    if (existing) {
      return NextResponse.json(
        { error: "شناسه ماژول تکراری است" },
        { status: 409 },
      );
    }

    const maxOrder = await prisma.reportModule.aggregate({
      _max: { sortOrder: true },
    });

    const created = await prisma.reportModule.create({
      data: {
        slug,
        nameFa: parsed.data.nameFa,
        description: parsed.data.description,
        sortOrder: parsed.data.sortOrder ?? (maxOrder._max.sortOrder ?? 0) + 1,
      },
    });

    return NextResponse.json({
      module: {
        id: created.slug,
        dbId: created.id,
        nameFa: created.nameFa,
        description: created.description,
        sortOrder: created.sortOrder,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "خطا";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
