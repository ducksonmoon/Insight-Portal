import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, FolderOpen, Pencil, Play, Plus } from "lucide-react";

import { ReportImportExport } from "@/components/admin/report-import-export";
import { ReportSourceBadge } from "@/components/admin/report-source-badge";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth/auth";
import type { OrgFolderNode, OrgReportItem } from "@/lib/reports/organization";
import { loadReportOrganization } from "@/lib/reports/organization";

export const dynamic = "force-dynamic";

function AdminReportRow({ report }: { report: OrgReportItem }) {
  return (
    <div className="action-row">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-[var(--foreground)]">{report.nameFa}</p>
          <ReportSourceBadge sourceType={report.sourceType} />
        </div>
        <p className="text-xs text-[var(--muted)]">
          <code>{report.id}</code> · {report.parameterCount} پارامتر ·{" "}
          {report.columnCount} ستون
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button asChild size="sm">
          <Link href={`/admin/reports/${report.id}/edit`}>
            <Pencil className="h-3.5 w-3.5" />
            ویرایش
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href={`/reports/${report.id}`}>
            <Play className="h-3.5 w-3.5" />
            اجرا
          </Link>
        </Button>
      </div>
    </div>
  );
}

function FolderReports({ folder }: { folder: OrgFolderNode }) {
  const hasContent =
    folder.reports.length > 0 ||
    folder.children.some(
      (c) => c.reports.length > 0 || c.children.length > 0,
    );
  if (!hasContent) return null;

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-[var(--muted)]">{folder.nameFa}</p>
      <div className="list-panel">
        {folder.reports.map((r) => (
          <AdminReportRow key={r.id} report={r} />
        ))}
      </div>
      {folder.children.map((child) => (
        <div key={child.id} className="mr-4">
          <FolderReports folder={child} />
        </div>
      ))}
    </div>
  );
}

export default async function AdminReportsPage() {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    redirect("/?denied=admin");
  }

  const organization = await loadReportOrganization();
  const activeModules = organization.filter((m) => m.reportCount > 0);
  const totalReports = organization.reduce((n, m) => n + m.reportCount, 0);

  return (
    <div className="animate-stagger space-y-6">
      <PageHeader
        title="استودیو گزارش"
        subtitle="ساخت، ویرایش و انتشار گزارش‌های SQL — ساختار ماژول/پوشه از «ماژول‌ها»"
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/modules">
                <FolderOpen className="h-4 w-4" />
                ماژول‌ها
              </Link>
            </Button>
            <Button asChild>
              <Link href="/admin/reports/new">
                <Plus className="h-4 w-4" />
                گزارش جدید
              </Link>
            </Button>
          </>
        }
      />

      <div className="stat-strip">
        <div className="stat-strip-item">
          <div>
            <p className="stat-strip-label">کل گزارش‌ها</p>
            <p className="stat-strip-value">{totalReports}</p>
          </div>
        </div>
        <div className="stat-strip-item">
          <div>
            <p className="stat-strip-label">ماژول‌های فعال</p>
            <p className="stat-strip-value">{activeModules.length}</p>
          </div>
        </div>
        <div className="stat-strip-item">
          <div>
            <p className="stat-strip-label">جریان کار</p>
            <p className="stat-strip-hint">
              SQL → پارامتر → ستون → آزمایش → انتشار
            </p>
          </div>
        </div>
      </div>

      {activeModules.map((module) => (
        <section key={module.id} className="space-y-3">
          <div>
            <h2 className="section-title">{module.nameFa}</h2>
            {module.description ? (
              <p className="section-desc">{module.description}</p>
            ) : null}
          </div>

          {module.folders.map((folder) => (
            <FolderReports key={folder.id} folder={folder} />
          ))}

          {module.reports.length ? (
            <div className="list-panel">
              {module.reports.map((report) => (
                <AdminReportRow key={report.id} report={report} />
              ))}
            </div>
          ) : null}
        </section>
      ))}

      {!totalReports ? (
        <div className="results-empty">
          <p className="font-semibold text-[var(--foreground)]">هنوز گزارشی نیست</p>
          <p className="mt-2">
            اولین گزارش را بسازید یا <code>npm run db:seed</code> را اجرا کنید
          </p>
          <Button asChild className="mt-4">
            <Link href="/admin/reports/new">
              <ArrowLeft className="h-4 w-4" />
              شروع با گزارش جدید
            </Link>
          </Button>
        </div>
      ) : null}

      <ReportImportExport />
    </div>
  );
}
