import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/db/prisma";

const createSchema = z.object({
  slug: z.string().min(1).max(60),
  nameFa: z.string().min(1).max(120),
});

const bulkGrantSchema = z.object({
  roleId: z.string(),
  moduleIds: z.array(z.string()).optional(),
  reportIds: z.array(z.string()).optional(),
  userIds: z.array(z.string()).optional(),
});

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const roles = await prisma.role.findMany({
    orderBy: { nameFa: "asc" },
    include: {
      _count: {
        select: {
          users: true,
          moduleAccess: true,
          reportAccess: true,
        },
      },
    },
  });

  return NextResponse.json({ ok: true, roles });
}

export async function POST(request: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const json = await request.json();

  if (json.bulkGrant) {
    const parsed = bulkGrantSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message }, { status: 400 });
    }

    const { roleId, moduleIds = [], reportIds = [], userIds = [] } = parsed.data;
    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      return NextResponse.json({ error: "نقش یافت نشد" }, { status: 404 });
    }

    await prisma.$transaction([
      ...moduleIds.map((moduleId) =>
        prisma.roleModuleAccess.upsert({
          where: { roleId_moduleId: { roleId, moduleId } },
          create: { roleId, moduleId, canView: true },
          update: { canView: true },
        }),
      ),
      ...reportIds.map((reportId) =>
        prisma.roleReportAccess.upsert({
          where: { roleId_reportId: { roleId, reportId } },
          create: { roleId, reportId, canView: true, canExport: true },
          update: { canView: true, canExport: true },
        }),
      ),
      ...userIds.map((userId) =>
        prisma.userRole.upsert({
          where: { userId_roleId: { userId, roleId } },
          create: { userId, roleId },
          update: {},
        }),
      ),
    ]);

    return NextResponse.json({ ok: true });
  }

  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const role = await prisma.role.create({ data: parsed.data });
  return NextResponse.json({ ok: true, role });
}
