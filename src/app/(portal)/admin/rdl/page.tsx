import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Loader2 } from "lucide-react";

import { RdlManager } from "@/components/admin/rdl-manager";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth/auth";

export const dynamic = "force-dynamic";

export default async function RdlAdminPage() {
  const session = await auth();
  if (!session?.user?.isAdmin) redirect("/?denied=admin");

  return (
    <div className="animate-stagger space-y-6">
      <PageHeader
        title="مهاجرت RDL"
        subtitle="بارگذاری گزارش SSRS، مشاهده SQL و پارامترها، تبدیل به گزارش Insight"
        breadcrumbs={[
          { label: "مدیریت", href: "/admin/reports" },
          { label: "مهاجرت RDL" },
        ]}
        actions={
          <Button asChild variant="outline">
            <Link href="/admin/migration">داشبورد پیشرفت</Link>
          </Button>
        }
      />
      <Suspense
        fallback={
          <div className="flex items-center gap-2 text-[var(--muted)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            در حال بارگذاری...
          </div>
        }
      >
        <RdlManager />
      </Suspense>
    </div>
  );
}
