import Link from "next/link";
import { ArrowLeft, Folder } from "lucide-react";
import { redirect } from "next/navigation";

import { Suspense } from "react";

import { AccessDeniedBanner } from "@/components/layout/access-denied-banner";
import { EmptyState, PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth/auth";
import { filterViewableReportIds } from "@/lib/auth/access";
import type { OrgFolderNode, OrgModuleNode, OrgReportItem } from "@/lib/reports/organization";
import { loadReportOrganization } from "@/lib/reports/organization";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ module?: string }>;
};

function ReportLink({ report }: { report: OrgReportItem }) {
  return (
    <Link href={`/reports/${report.id}`} className="action-row group">
      <div className="min-w-0">
        <p className="font-semibold text-[var(--foreground)] group-hover:text-[var(--primary)]">
          {report.nameFa}
        </p>
        <p className="text-xs text-[var(--muted)]">
          {report.parameterCount} فیلتر ·{" "}
          {report.columnCount
            ? `${report.columnCount} ستون`
            : "ستون‌ها پس از اولین اجرا"}
        </p>
      </div>
      <ArrowLeft className="h-4 w-4 shrink-0 text-[var(--primary)] opacity-60 group-hover:opacity-100" />
    </Link>
  );
}

function FolderSection({
  folder,
  depth = 0,
}: {
  folder: OrgFolderNode;
  depth?: number;
}) {
  const hasContent = folder.reports.length > 0 || folder.children.length > 0;
  if (!hasContent) return null;

  return (
    <div style={{ marginRight: depth * 12 }}>
      <div className="mb-2 flex items-center gap-2 px-1">
        <Folder className="h-4 w-4 text-[var(--primary)]" />
        <h3 className="text-sm font-bold text-[var(--foreground)]">{folder.nameFa}</h3>
      </div>
      <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)]">
        {folder.reports.map((report) => (
          <ReportLink key={report.id} report={report} />
        ))}
      </div>
      {folder.children.map((child) => (
        <div key={child.id} className="mt-3">
          <FolderSection folder={child} depth={depth + 1} />
        </div>
      ))}
    </div>
  );
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
    .map((m) => ({
      ...m,
      reports: filterReports(m.reports),
      folders: filterFolders(m.folders),
      reportCount:
        filterReports(m.reports).length +
        filterFolders(m.folders).reduce(
          (sum, f) =>
            sum +
            f.reports.length +
            f.children.reduce((s, c) => s + c.reports.length, 0),
          0,
        ),
    }))
    .filter((m) => m.reportCount > 0);
}

export default async function ReportsPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { module: moduleFilter } = await searchParams;

  const organization = await loadReportOrganization();
  const allIds = organization.flatMap((m) => [
    ...m.reports.map((r) => r.id),
    ...m.folders.flatMap(function collect(f): string[] {
      return [...f.reports.map((r) => r.id), ...f.children.flatMap(collect)];
    }),
  ]);

  const allowedIds = await filterViewableReportIds(session.user, allIds);
  const allowed = new Set(allowedIds);
  let visible = filterOrganization(
    organization,
    allowed,
    Boolean(session.user.isAdmin),
  );

  if (moduleFilter) {
    visible = visible.filter((m) => m.id === moduleFilter);
  }

  const filteredModule = moduleFilter
    ? organization.find((m) => m.id === moduleFilter)
    : null;

  return (
    <div className="space-y-6">
      <Suspense fallback={null}>
        <AccessDeniedBanner />
      </Suspense>
      <PageHeader
        title={filteredModule ? filteredModule.nameFa : "گزارش‌ها"}
        subtitle={
          filteredModule
            ? filteredModule.description ?? "گزارش‌های این ماژول"
            : "گزارش‌ها بر اساس ماژول و پوشه‌ای که مدیر تعریف کرده نمایش داده می‌شوند"
        }
        breadcrumbs={
          filteredModule
            ? [
                { label: "گزارش‌ها", href: "/reports" },
                { label: filteredModule.nameFa },
              ]
            : undefined
        }
        actions={
          <>
            {filteredModule ? (
              <Button asChild variant="outline">
                <Link href="/reports">همه ماژول‌ها</Link>
              </Button>
            ) : null}
            {session.user.isAdmin ? (
              <>
                <Button asChild variant="outline">
                  <Link href="/modules">ماژول‌ها و پوشه‌ها</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/admin/reports">استودیو گزارش</Link>
                </Button>
              </>
            ) : null}
          </>
        }
      />

      {visible.map((module) => (
        <section key={module.id} className="space-y-4">
          {!filteredModule ? (
            <div>
              <h2 className="section-title">{module.nameFa}</h2>
              {module.description ? (
                <p className="section-desc">{module.description}</p>
              ) : null}
            </div>
          ) : null}

          {module.folders.map((folder) => (
            <FolderSection key={folder.id} folder={folder} />
          ))}

          {module.reports.length ? (
            <div className="list-panel">
              {module.reports.map((report) => (
                <ReportLink key={report.id} report={report} />
              ))}
            </div>
          ) : null}
        </section>
      ))}

      {!visible.length ? (
        <EmptyState
          title={
            moduleFilter
              ? "گزارشی در این ماژول نیست"
              : "گزارشی برای شما فعال نیست"
          }
          description={
            session.user.isAdmin
              ? "از استودیو گزارش بسازید یا در «ماژول‌ها» ساختار بچینید"
              : "با مدیر سیستم برای دریافت دسترسی هماهنگ کنید"
          }
          action={
            moduleFilter ? (
              <Button asChild variant="outline">
                <Link href="/reports">بازگشت به همه گزارش‌ها</Link>
              </Button>
            ) : null
          }
        />
      ) : null}
    </div>
  );
}
