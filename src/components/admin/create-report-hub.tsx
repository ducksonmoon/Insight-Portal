"use client";

import Link from "next/link";
import { FileCode2, FileUp, Sparkles } from "lucide-react";

import { ReportImportExport } from "@/components/admin/report-import-export";
import { ReportStudio } from "@/components/admin/report-studio";
import { Button } from "@/components/ui/button";

type CreateReportHubProps = {
  mode?: string | null;
  moduleId?: string | null;
};

export function CreateReportHub({ mode, moduleId }: CreateReportHubProps) {
  if (mode === "studio") {
    return <ReportStudio mode="create" />;
  }

  const rdlHref = moduleId
    ? `/admin/rdl?module=${encodeURIComponent(moduleId)}`
    : "/admin/rdl";

  return (
    <div className="animate-stagger space-y-6">
      <div>
        <h1 className="page-title">گزارش جدید</h1>
        <p className="page-subtitle">
          مسیر ساخت را یک‌بار انتخاب کنید — زمان اجرا همه گزارش‌ها با موتور Insight
          اجرا می‌شوند
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="surface-panel flex flex-col">
          <div className="surface-panel-header">
            <Sparkles className="mb-2 h-6 w-6 text-[var(--primary)]" />
            <p className="section-title">گزارش جدید در استودیو</p>
            <p className="section-desc">
              SQL، پارامترها، ستون‌ها و نمودار را از صفر بسازید
            </p>
          </div>
          <div className="surface-panel-body mt-auto">
            <Button asChild className="w-full">
              <Link href="/admin/reports/new?mode=studio">شروع در استودیو</Link>
            </Button>
          </div>
        </div>

        <div className="surface-panel flex flex-col">
          <div className="surface-panel-header">
            <FileUp className="mb-2 h-6 w-6 text-[var(--primary)]" />
            <p className="section-title">وارد کردن بسته</p>
            <p className="section-desc">
              فایل <code>.insight-report.json</code> از نصب دیگر یا پشتیبان
            </p>
          </div>
          <div className="surface-panel-body mt-auto">
            <Button asChild variant="outline" className="w-full">
              <a href="#package-import">رفتن به وارد کردن</a>
            </Button>
          </div>
        </div>

        <div className="surface-panel flex flex-col">
          <div className="surface-panel-header">
            <FileCode2 className="mb-2 h-6 w-6 text-[var(--primary)]" />
            <p className="section-title">بارگذاری RDL</p>
            <p className="section-desc">
              فایل SSRS/Rahkaran — استخراج SQL و تبدیل به گزارش Insight
            </p>
          </div>
          <div className="surface-panel-body mt-auto">
            <Button asChild variant="outline" className="w-full">
              <Link href={rdlHref}>مدیریت RDL</Link>
            </Button>
          </div>
        </div>
      </div>

      <div id="package-import">
        <ReportImportExport />
      </div>
    </div>
  );
}
