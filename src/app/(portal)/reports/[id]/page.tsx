import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { ReportViewer } from "@/components/reports/report-viewer";
import { auth } from "@/lib/auth/auth";
import { canViewReport } from "@/lib/auth/access";
import { getReportPlacement } from "@/lib/reports/organization";
import { getReportDefinition } from "@/lib/reports/registry";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ReportDetailPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;
  const allowed = await canViewReport(session.user, id);
  if (!allowed) {
    redirect("/reports?denied=report");
  }

  const report = await getReportDefinition(id);
  if (!report) {
    notFound();
  }

  const placement = await getReportPlacement(id);

  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-12 text-[var(--muted)]">
          در حال بارگذاری گزارش…
        </div>
      }
    >
      <ReportViewer report={report} placement={placement} />
    </Suspense>
  );
}
