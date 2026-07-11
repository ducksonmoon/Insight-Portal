import { getRahkaranPool, isRahkaranConfigured } from "@/lib/db/rahkaran";
import { prisma } from "@/lib/db/prisma";
import { filterViewableReportIds } from "@/lib/auth/access";
import type { AccessSessionUser } from "@/lib/auth/access";
import {
  loadReportOrganization,
  type OrgFolderNode,
  type OrgModuleNode,
  type OrgReportItem,
} from "@/lib/reports/organization";
import { listReportDefinitions } from "@/lib/reports/registry";
import { isReportParameterRequired } from "@/lib/reports/parameter-utils";

export type DashboardKpi = {
  id: string;
  title: string;
  value: string;
  hint: string;
  tone: "primary" | "success" | "warning" | "muted";
};

export type DashboardRecentReport = {
  slug: string;
  nameFa: string;
  moduleId: string;
  lastRunAt: string;
};

export type DashboardFavorite = {
  slug: string;
  nameFa: string;
  moduleId: string;
};

export type DashboardSavedViewItem = {
  id: string;
  reportSlug: string;
  reportNameFa: string;
  nameFa: string;
  parameters: Record<string, unknown>;
  isDefault: boolean;
};

export type DashboardModuleCard = {
  id: string;
  nameFa: string;
  description?: string;
  reportCount: number;
  topReports: Array<{ id: string; nameFa: string }>;
  lastRunAt: string | null;
};

export type DashboardScheduleItem = {
  id: string;
  nameFa: string;
  reportSlug: string;
  reportNameFa: string;
  frequency: string;
  runAt: string;
  nextRunAt: string | null;
  format: string;
};

export type DashboardPinnedReport = {
  reportSlug: string;
  nameFa: string;
  viewId?: string;
  viewNameFa?: string;
  parameterSummary: string;
  hasRequiredParams: boolean;
};

export type DashboardWidgetItem = {
  id: string;
  title: string;
  type: string;
  config: Record<string, unknown>;
  sortOrder: number;
};

export type DashboardMigrationStats = {
  total: number;
  converted: number;
  needsReview: number;
  failed: number;
  progressPct: number;
};

export type DashboardData = {
  userKpis: DashboardKpi[];
  systemKpis: DashboardKpi[];
  recentReports: DashboardRecentReport[];
  favorites: DashboardFavorite[];
  savedViews: DashboardSavedViewItem[];
  moduleCards: DashboardModuleCard[];
  pinnedReports: DashboardPinnedReport[];
  schedules: DashboardScheduleItem[];
  widgets: DashboardWidgetItem[];
  migration: DashboardMigrationStats | null;
  rahkaranConnected: boolean;
  allowedReportCount: number;
  displayName: string;
};

function collectReportIds(module: OrgModuleNode): string[] {
  const ids: string[] = module.reports.map((r) => r.id);
  function walk(folder: OrgFolderNode) {
    ids.push(...folder.reports.map((r) => r.id));
    folder.children.forEach(walk);
  }
  module.folders.forEach(walk);
  return ids;
}

function filterOrganization(
  org: OrgModuleNode[],
  allowed: Set<string>,
  isAdmin: boolean,
): OrgModuleNode[] {
  if (isAdmin) return org.filter((m) => m.reportCount > 0);

  function filterReports(reports: OrgReportItem[]) {
    return reports.filter((r) => allowed.has(r.id));
  }

  function filterFolders(folders: OrgFolderNode[]): OrgFolderNode[] {
    return folders
      .map((f) => ({
        ...f,
        reports: filterReports(f.reports),
        children: filterFolders(f.children),
      }))
      .filter((f) => f.reports.length > 0 || f.children.length > 0);
  }

  return org
    .map((m) => {
      const filteredReports = filterReports(m.reports);
      const filteredFolders = filterFolders(m.folders);
      const countInFolders = (nodes: OrgFolderNode[]): number =>
        nodes.reduce(
          (sum, n) => sum + n.reports.length + countInFolders(n.children),
          0,
        );
      return {
        ...m,
        reports: filteredReports,
        folders: filteredFolders,
        reportCount: filteredReports.length + countInFolders(filteredFolders),
      };
    })
    .filter((m) => m.reportCount > 0);
}

function summarizeParams(params: Record<string, unknown>): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v != null && v !== "",
  );
  if (!entries.length) return "بدون فیلتر";
  return entries
    .slice(0, 3)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(" · ");
}

function formatFaNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(n));
}

export async function ensureDefaultDashboardWidgets() {
  const count = await prisma.dashboardWidget.count();
  if (count > 0) return;

  await prisma.dashboardWidget.createMany({
    data: [
      {
        title: "همه گزارش‌ها",
        type: "report-link",
        config: JSON.stringify({
          href: "/reports",
          label: "مشاهده فهرست کامل",
        }),
        sortOrder: 0,
      },
      {
        title: "راهنما",
        type: "text",
        config: JSON.stringify({
          text: "گزارش‌های اخیر، علاقه‌مندی‌ها و نماهای ذخیره‌شده در بالای داشبورد نمایش داده می‌شوند.",
        }),
        sortOrder: 1,
      },
    ],
  });
}

export async function getDashboardData(
  user: AccessSessionUser & { displayName?: string | null },
): Promise<DashboardData> {
  const isAdmin = Boolean(user.isAdmin);
  const userId = user.id!;

  await ensureDefaultDashboardWidgets();

  const [organization, allReports, widgets] = await Promise.all([
    loadReportOrganization(),
    listReportDefinitions(),
    prisma.dashboardWidget.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  const allIds = organization.flatMap(collectReportIds);
  const allowedIds = isAdmin
    ? allIds
    : await filterViewableReportIds(user, allIds);
  const allowed = new Set(allowedIds);
  const visibleOrg = filterOrganization(organization, allowed, isAdmin);

  const reportBySlug = new Map(allReports.map((r) => [r.id, r]));
  const rahkaranConnected = isRahkaranConfigured();

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [
    favoritesRaw,
    savedViewsRaw,
    recentLogs,
    schedulesRaw,
    executesToday,
    exportsToday,
    failedToday,
    migrationCounts,
  ] = await Promise.all([
    prisma.reportFavorite.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    prisma.savedReportView.findMany({
      where: { userId },
      orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
      take: 12,
    }),
    prisma.auditLog.findMany({
      where: {
        userId,
        action: "execute",
        success: true,
        reportId: { not: null },
      },
      orderBy: { createdAt: "desc" },
      take: 40,
      include: {
        report: { select: { slug: true, nameFa: true, module: { select: { slug: true } } } },
      },
    }),
    prisma.reportSchedule.findMany({
      where: isAdmin ? { isActive: true } : { userId, isActive: true },
      orderBy: { nextRunAt: "asc" },
      take: 8,
    }),
    prisma.auditLog.count({
      where: {
        userId,
        action: "execute",
        success: true,
        createdAt: { gte: startOfDay },
      },
    }),
    prisma.auditLog.count({
      where: {
        userId,
        action: { in: ["export", "export_pdf"] },
        success: true,
        createdAt: { gte: startOfDay },
      },
    }),
    prisma.auditLog.count({
      where: {
        userId,
        success: false,
        createdAt: { gte: startOfDay },
      },
    }),
    isAdmin
      ? Promise.all([
          prisma.rdlReport.count({ where: { isActive: true } }),
          prisma.rdlReport.count({
            where: { isActive: true, convertStatus: "converted" },
          }),
          prisma.rdlReport.count({
            where: { isActive: true, convertStatus: "needs_review" },
          }),
          prisma.rdlReport.count({
            where: { isActive: true, convertStatus: "failed" },
          }),
        ])
      : Promise.resolve([0, 0, 0, 0] as const),
  ]);

  const seenRecent = new Set<string>();
  const recentReports: DashboardRecentReport[] = [];
  for (const log of recentLogs) {
    const slug = log.report?.slug;
    if (!slug || !allowed.has(slug) || seenRecent.has(slug)) continue;
    seenRecent.add(slug);
    recentReports.push({
      slug,
      nameFa: log.report!.nameFa,
      moduleId: log.report!.module.slug,
      lastRunAt: log.createdAt.toISOString(),
    });
    if (recentReports.length >= 6) break;
  }

  const favorites: DashboardFavorite[] = favoritesRaw
    .filter((f) => allowed.has(f.reportSlug))
    .map((f) => {
      const report = reportBySlug.get(f.reportSlug);
      return {
        slug: f.reportSlug,
        nameFa: report?.nameFa ?? f.reportSlug,
        moduleId: report?.moduleId ?? "",
      };
    });

  const savedViews: DashboardSavedViewItem[] = savedViewsRaw
    .filter((v) => allowed.has(v.reportSlug))
    .map((v) => {
      const report = reportBySlug.get(v.reportSlug);
      let parameters: Record<string, unknown> = {};
      try {
        parameters = JSON.parse(v.parameters) as Record<string, unknown>;
      } catch {
        parameters = {};
      }
      return {
        id: v.id,
        reportSlug: v.reportSlug,
        reportNameFa: report?.nameFa ?? v.reportSlug,
        nameFa: v.nameFa,
        parameters,
        isDefault: v.isDefault,
      };
    });

  const lastRunBySlug = new Map<string, string>();
  for (const log of recentLogs) {
    if (log.report?.slug && !lastRunBySlug.has(log.report.slug)) {
      lastRunBySlug.set(log.report.slug, log.createdAt.toISOString());
    }
  }

  const moduleCards: DashboardModuleCard[] = visibleOrg.map((mod) => {
    const ids = collectReportIds(mod);
    const moduleLastRuns = ids
      .map((id) => lastRunBySlug.get(id))
      .filter(Boolean) as string[];
    const lastRunAt = moduleLastRuns.length
      ? moduleLastRuns.sort().reverse()[0]!
      : null;

    const topReports: Array<{ id: string; nameFa: string }> = [];
    for (const r of mod.reports) {
      if (topReports.length < 3) topReports.push({ id: r.id, nameFa: r.nameFa });
    }
    if (topReports.length < 3) {
      for (const folder of mod.folders) {
        for (const r of folder.reports) {
          if (topReports.length < 3) topReports.push({ id: r.id, nameFa: r.nameFa });
        }
      }
    }

    return {
      id: mod.id,
      nameFa: mod.nameFa,
      description: mod.description,
      reportCount: mod.reportCount,
      topReports,
      lastRunAt,
    };
  });

  const pinnedReports: DashboardPinnedReport[] = [];
  const pinWidgets = widgets.filter(
    (w) => w.type === "report-pin" || w.type === "chart",
  );
  for (const w of pinWidgets) {
    const config = JSON.parse(w.config) as Record<string, unknown>;
    const reportSlug = String(config.reportSlug ?? "");
    if (!reportSlug || !allowed.has(reportSlug)) continue;
    const report = reportBySlug.get(reportSlug);
    if (!report) continue;

    const viewId = config.viewId ? String(config.viewId) : undefined;
    const view = viewId
      ? savedViews.find((sv) => sv.id === viewId)
      : savedViews.find((sv) => sv.reportSlug === reportSlug && sv.isDefault);

    const params = view?.parameters ?? {};
    pinnedReports.push({
      reportSlug,
      nameFa: report.nameFa,
      viewId: view?.id,
      viewNameFa: view?.nameFa,
      parameterSummary: summarizeParams(params),
      hasRequiredParams: report.parameters.some(isReportParameterRequired),
    });
  }

  const schedules: DashboardScheduleItem[] = schedulesRaw
    .filter((s) => allowed.has(s.reportSlug))
    .map((s) => ({
      id: s.id,
      nameFa: s.nameFa,
      reportSlug: s.reportSlug,
      reportNameFa: reportBySlug.get(s.reportSlug)?.nameFa ?? s.reportSlug,
      frequency: s.frequency,
      runAt: s.runAt,
      nextRunAt: s.nextRunAt?.toISOString() ?? null,
      format: s.format,
    }));

  const userKpis: DashboardKpi[] = [
    {
      id: "allowed",
      title: "گزارش‌های مجاز",
      value: String(allowedIds.length),
      hint: "قابل مشاهده برای شما",
      tone: "primary",
    },
    {
      id: "runs-today",
      title: "اجرای امروز",
      value: String(executesToday),
      hint: "گزارش‌های اجراشده",
      tone: executesToday > 0 ? "success" : "muted",
    },
    {
      id: "exports-today",
      title: "خروجی امروز",
      value: String(exportsToday),
      hint: "Excel و چاپ",
      tone: exportsToday > 0 ? "success" : "muted",
    },
    {
      id: "favorites",
      title: "علاقه‌مندی",
      value: String(favorites.length),
      hint: "گزارش‌های ستاره‌دار",
      tone: favorites.length ? "primary" : "muted",
    },
  ];

  if (failedToday > 0) {
    userKpis.push({
      id: "failed-today",
      title: "خطای امروز",
      value: String(failedToday),
      hint: "اجرای ناموفق",
      tone: "warning",
    });
  }

  const systemKpis: DashboardKpi[] = [
    {
      id: "reports-total",
      title: "گزارش‌های منتشرشده",
      value: String(allReports.length),
      hint: "در کل سامانه",
      tone: "muted",
    },
    {
      id: "db",
      title: "راهکاران",
      value: rahkaranConnected ? "متصل" : "تنظیم نشده",
      hint: rahkaranConnected ? "اتصال خواندنی" : "env.local",
      tone: rahkaranConnected ? "success" : "warning",
    },
  ];

  if (rahkaranConnected) {
    try {
      const pool = await getRahkaranPool();
      const request = pool.request();
      (request as { timeout?: number }).timeout = 8000;
      const result = await request.query(`
        SELECT
          (SELECT COUNT_BIG(*) FROM fin3.Voucher WHERE IsTemporary = 0 AND State <> 2 AND LedgerRef = 1) AS VoucherCount
      `);
      const row = result.recordset?.[0] as { VoucherCount?: number | string } | undefined;
      if (row?.VoucherCount != null) {
        systemKpis.push({
          id: "vouchers",
          title: "اسناد حسابداری",
          value: formatFaNumber(Number(row.VoucherCount)),
          hint: "دفتر اصلی",
          tone: "success",
        });
      }
    } catch {
      /* optional */
    }
  }

  const [totalRdl, convertedRdl, reviewRdl, failedRdl] = migrationCounts;
  const migration: DashboardMigrationStats | null = isAdmin
    ? {
        total: totalRdl,
        converted: convertedRdl,
        needsReview: reviewRdl,
        failed: failedRdl,
        progressPct: totalRdl
          ? Math.round(((convertedRdl + reviewRdl) / totalRdl) * 100)
          : 0,
      }
    : null;

  return {
    userKpis,
    systemKpis,
    recentReports,
    favorites,
    savedViews,
    moduleCards,
    pinnedReports,
    schedules,
    widgets: widgets.map((w) => ({
      id: w.id,
      title: w.title,
      type: w.type,
      config: JSON.parse(w.config) as Record<string, unknown>,
      sortOrder: w.sortOrder,
    })),
    migration,
    rahkaranConnected,
    allowedReportCount: allowedIds.length,
    displayName: user.displayName ?? "",
  };
}

export async function searchReports(
  user: AccessSessionUser,
  query: string,
  limit = 20,
): Promise<
  Array<{ slug: string; nameFa: string; moduleId: string; parameterCount: number }>
> {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const reports = await listReportDefinitions();
  const matches = reports.filter(
    (r) =>
      r.nameFa.toLowerCase().includes(q) ||
      r.id.toLowerCase().includes(q) ||
      r.moduleId.toLowerCase().includes(q),
  );

  const slugs = matches.map((r) => r.id);
  const allowed = user.isAdmin
    ? slugs
    : await filterViewableReportIds(user, slugs);
  const allowedSet = new Set(allowed);

  return matches
    .filter((r) => allowedSet.has(r.id))
    .slice(0, limit)
    .map((r) => ({
      slug: r.id,
      nameFa: r.nameFa,
      moduleId: r.moduleId,
      parameterCount: r.parameters.length,
    }));
}
