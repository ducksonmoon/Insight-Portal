import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";

import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const [users, modules, reports, roles] = await Promise.all([
      prisma.user.findMany({
        orderBy: { username: "asc" },
        take: 500,
        select: {
          id: true,
          username: true,
          displayName: true,
          isAdmin: true,
          isActive: true,
          domainUserName: true,
          moduleAccess: {
            select: { moduleId: true, canView: true, module: { select: { slug: true, nameFa: true } } },
          },
          reportAccess: {
            select: {
              reportId: true,
              canView: true,
              canExport: true,
              report: { select: { slug: true, nameFa: true } },
            },
          },
          roles: {
            select: {
              roleId: true,
              role: { select: { id: true, slug: true, nameFa: true } },
            },
          },
        },
      }),
      prisma.reportModule.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        select: { id: true, slug: true, nameFa: true },
      }),
      prisma.report.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          slug: true,
          nameFa: true,
          moduleId: true,
          module: { select: { slug: true } },
        },
      }),
      prisma.role.findMany({
        orderBy: { nameFa: "asc" },
        select: { id: true, slug: true, nameFa: true },
      }),
    ]);

    return NextResponse.json({ users, modules, reports, roles });
  } catch (err) {
    const message = err instanceof Error ? err.message : "خطا";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const grantSchema = z.object({
  userId: z.string().min(1),
  moduleIds: z.array(z.string()).optional(),
  roleIds: z.array(z.string()).optional(),
  reportGrants: z
    .array(
      z.object({
        reportId: z.string(),
        canView: z.boolean().default(true),
        canExport: z.boolean().default(true),
      }),
    )
    .optional(),
  setPassword: z
    .object({
      password: z.string().min(6),
      isAdmin: z.boolean().optional(),
      isActive: z.boolean().optional(),
    })
    .optional(),
});

export async function POST(request: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const json = await request.json();
    const parsed = grantSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "ورودی نامعتبر" }, { status: 400 });
    }

    const { userId, moduleIds, reportGrants, roleIds, setPassword } = parsed.data;

    if (moduleIds) {
      await prisma.userModuleAccess.deleteMany({ where: { userId } });
      if (moduleIds.length) {
        await prisma.userModuleAccess.createMany({
          data: moduleIds.map((moduleId) => ({
            userId,
            moduleId,
            canView: true,
          })),
        });
      }
    }

    if (roleIds) {
      await prisma.userRole.deleteMany({ where: { userId } });
      if (roleIds.length) {
        await prisma.userRole.createMany({
          data: roleIds.map((roleId) => ({ userId, roleId })),
        });
      }
    }

    if (reportGrants) {
      await prisma.userReportAccess.deleteMany({ where: { userId } });
      if (reportGrants.length) {
        await prisma.userReportAccess.createMany({
          data: reportGrants.map((g) => ({
            userId,
            reportId: g.reportId,
            canView: g.canView,
            canExport: g.canExport,
          })),
        });
      }
    }

    if (setPassword) {
      const hash = await bcrypt.hash(setPassword.password, 10);
      await prisma.user.update({
        where: { id: userId },
        data: {
          passwordHash: hash,
          ...(setPassword.isAdmin !== undefined
            ? { isAdmin: setPassword.isAdmin }
            : {}),
          ...(setPassword.isActive !== undefined
            ? { isActive: setPassword.isActive }
            : {}),
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "خطا";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
