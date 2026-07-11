import { prisma } from "@/lib/db/prisma";
import { getReportDefinition } from "@/lib/reports/registry";

export type AccessSessionUser = {
  id?: string;
  isAdmin?: boolean;
};

type GrantCache = {
  moduleIds: Set<string>;
  reportIds: Set<string>;
};

async function loadUserGrants(userId: string): Promise<GrantCache> {
  const roleLinks = await prisma.userRole.findMany({
    where: { userId },
    select: { roleId: true },
  });
  const roleIds = roleLinks.map((r) => r.roleId);

  const [userModules, userReports, roleModules, roleReports] = await Promise.all([
    prisma.userModuleAccess.findMany({
      where: { userId, canView: true },
      select: { moduleId: true },
    }),
    prisma.userReportAccess.findMany({
      where: { userId, canView: true },
      select: { reportId: true },
    }),
    roleIds.length
      ? prisma.roleModuleAccess.findMany({
          where: { roleId: { in: roleIds }, canView: true },
          select: { moduleId: true },
        })
      : Promise.resolve([]),
    roleIds.length
      ? prisma.roleReportAccess.findMany({
          where: { roleId: { in: roleIds }, canView: true },
          select: { reportId: true },
        })
      : Promise.resolve([]),
  ]);

  return {
    moduleIds: new Set([
      ...userModules.map((m) => m.moduleId),
      ...roleModules.map((m) => m.moduleId),
    ]),
    reportIds: new Set([
      ...userReports.map((r) => r.reportId),
      ...roleReports.map((r) => r.reportId),
    ]),
  };
}

export async function canViewReport(
  user: AccessSessionUser | null | undefined,
  reportSlug: string,
  grants?: GrantCache,
): Promise<boolean> {
  if (!user?.id) return false;
  if (user.isAdmin) return true;

  const report = await getReportDefinition(reportSlug);
  if (!report) return false;

  try {
    const g = grants ?? (await loadUserGrants(user.id));

    const dbReport = await prisma.report.findUnique({
      where: { slug: reportSlug },
      select: {
        id: true,
        moduleId: true,
        module: { select: { slug: true } },
      },
    });

    if (dbReport) {
      if (g.reportIds.has(dbReport.id)) return true;
      if (g.moduleIds.has(dbReport.moduleId)) return true;
    }

    const module = await prisma.reportModule.findUnique({
      where: { slug: report.moduleId },
      select: { id: true },
    });
    if (module && g.moduleIds.has(module.id)) return true;

    return false;
  } catch {
    return false;
  }
}

export async function canExportReport(
  user: AccessSessionUser | null | undefined,
  reportSlug: string,
): Promise<boolean> {
  if (!user?.id) return false;
  if (user.isAdmin) return true;

  const canView = await canViewReport(user, reportSlug);
  if (!canView) return false;

  try {
    const dbReport = await prisma.report.findUnique({
      where: { slug: reportSlug },
      select: { id: true },
    });
    if (!dbReport) return true;

    const reportAccess = await prisma.userReportAccess.findUnique({
      where: {
        userId_reportId: { userId: user.id, reportId: dbReport.id },
      },
    });
    if (reportAccess) return reportAccess.canExport;
    return true;
  } catch {
    return false;
  }
}

export async function filterViewableReportIds(
  user: AccessSessionUser | null | undefined,
  reportIds: string[],
): Promise<string[]> {
  if (!user?.id) return [];
  if (user.isAdmin) return reportIds;
  if (!reportIds.length) return [];

  try {
    const grants = await loadUserGrants(user.id);

    const reports = await prisma.report.findMany({
      where: { slug: { in: reportIds }, isActive: true },
      select: { id: true, slug: true, moduleId: true },
    });

    const allowed = new Set(
      reports
        .filter(
          (r) => grants.reportIds.has(r.id) || grants.moduleIds.has(r.moduleId),
        )
        .map((r) => r.slug),
    );

    // Code-only reports (not in DB): check module slug via grants
    const missing = reportIds.filter(
      (id) => !reports.some((r) => r.slug === id) && allowed.has(id) === false,
    );
    for (const slug of missing) {
      const def = await getReportDefinition(slug);
      if (!def) continue;
      const mod = await prisma.reportModule.findUnique({
        where: { slug: def.moduleId },
        select: { id: true },
      });
      if (mod && grants.moduleIds.has(mod.id)) allowed.add(slug);
    }

    return reportIds.filter((id) => allowed.has(id));
  } catch {
    return [];
  }
}

export { loadUserGrants };
