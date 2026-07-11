import { isRahkaranConfigured } from "@/lib/db/rahkaran";
import { prisma } from "@/lib/db/prisma";
import { listDataSourceProviders } from "@/lib/reports/datasources";

export type SetupChecklistItem = {
  id: string;
  title: string;
  description: string;
  href: string;
  done: boolean;
};

export async function getSetupChecklist(): Promise<SetupChecklistItem[]> {
  const [
    userCount,
    reportCount,
    scheduleCount,
    moduleCount,
    grantCount,
  ] = await Promise.all([
    prisma.user.count({ where: { isActive: true } }),
    prisma.report.count({ where: { isActive: true } }),
    prisma.reportSchedule.count(),
    prisma.reportModule.count({ where: { isActive: true } }),
    prisma.userModuleAccess.count(),
  ]);

  const rahkaranOk = isRahkaranConfigured();
  const usersSynced = userCount > 1;
  const modulesOk = moduleCount > 0;
  const reportPublished = reportCount > 0;
  const aclConfigured = grantCount > 0;
  const scheduleCreated = scheduleCount > 0;

  return [
    {
      id: "rahkaran",
      title: "اتصال راهکاران",
      description: rahkaranOk
        ? "اتصال read-only برقرار است"
        : "متغیرهای RAHKARAN_DB_* را در env تنظیم کنید",
      href: "/settings",
      done: rahkaranOk,
    },
    {
      id: "users",
      title: "همگام‌سازی کاربران",
      description: usersSynced
        ? `${userCount} کاربر فعال`
        : "کاربران را از راهکاران همگام کنید",
      href: "/access",
      done: usersSynced,
    },
    {
      id: "modules",
      title: "ساختار ماژول‌ها",
      description: modulesOk
        ? `${moduleCount} ماژول تعریف شده`
        : "ماژول و پوشه بسازید",
      href: "/modules",
      done: modulesOk,
    },
    {
      id: "report",
      title: "اولین گزارش",
      description: reportPublished
        ? `${reportCount} گزارش منتشر شده`
        : "یک گزارش در استودیو بسازید",
      href: "/admin/reports/new",
      done: reportPublished,
    },
    {
      id: "acl",
      title: "تخصیص دسترسی",
      description: aclConfigured
        ? "دسترسی ماژول/گزارش تنظیم شده"
        : "به کاربران دسترسی بدهید",
      href: "/access",
      done: aclConfigured,
    },
    {
      id: "schedule",
      title: "زمان‌بندی",
      description: scheduleCreated
        ? `${scheduleCount} زمان‌بندی ثبت شده`
        : "ارسال خودکار گزارش را فعال کنید",
      href: "/admin/schedules",
      done: scheduleCreated,
    },
  ];
}

export function getProviderSummaries() {
  return listDataSourceProviders().map((p) => ({
    key: p.key,
    nameFa: p.nameFa,
    engine: p.engine,
    configured: p.isConfigured(),
    requiredEnvVars: p.requiredEnvVars,
  }));
}
