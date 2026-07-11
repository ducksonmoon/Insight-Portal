import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const [total, uploaded, converted, needsReview, failed, linked] =
    await Promise.all([
      prisma.rdlReport.count({ where: { isActive: true } }),
      prisma.rdlReport.count({
        where: { isActive: true, convertStatus: "uploaded" },
      }),
      prisma.rdlReport.count({
        where: { isActive: true, convertStatus: "converted" },
      }),
      prisma.rdlReport.count({
        where: { isActive: true, convertStatus: "needs_review" },
      }),
      prisma.rdlReport.count({
        where: { isActive: true, convertStatus: "failed" },
      }),
      prisma.rdlReport.count({
        where: { isActive: true, convertedReportId: { not: null } },
      }),
    ]);

  const recentFailures = await prisma.rdlReport.findMany({
    where: { isActive: true, convertStatus: "failed" },
    orderBy: { updatedAt: "desc" },
    take: 20,
    select: {
      id: true,
      slug: true,
      nameFa: true,
      originalFilename: true,
      convertError: true,
      updatedAt: true,
    },
  });

  const needsReviewList = await prisma.rdlReport.findMany({
    where: { isActive: true, convertStatus: "needs_review" },
    orderBy: { updatedAt: "desc" },
    take: 20,
    select: {
      id: true,
      slug: true,
      nameFa: true,
      originalFilename: true,
      convertedReportSlug: true,
      convertError: true,
      updatedAt: true,
    },
  });

  const byModule = await prisma.rdlReport.groupBy({
    by: ["moduleId"],
    where: { isActive: true },
    _count: { id: true },
  });

  const moduleIds = byModule
    .map((m) => m.moduleId)
    .filter((id): id is string => Boolean(id));
  const modules = moduleIds.length
    ? await prisma.reportModule.findMany({
        where: { id: { in: moduleIds } },
        select: { id: true, slug: true, nameFa: true },
      })
    : [];
  const moduleMap = new Map(modules.map((m) => [m.id, m]));

  return NextResponse.json({
    ok: true,
    stats: {
      total,
      uploaded,
      converted,
      needsReview,
      failed,
      linked,
      progressPct: total ? Math.round(((converted + needsReview) / total) * 100) : 0,
    },
    recentFailures,
    needsReviewList,
    byModule: byModule.map((row) => ({
      moduleId: row.moduleId,
      module: row.moduleId ? moduleMap.get(row.moduleId) : null,
      count: row._count.id,
    })),
  });
}
