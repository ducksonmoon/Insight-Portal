import Link from "next/link";
import { FolderOpen } from "lucide-react";
import { redirect } from "next/navigation";

import { ModulesManager } from "@/components/admin/modules-manager";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth/auth";

export const dynamic = "force-dynamic";

export default async function ModulesPage() {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    redirect("/?denied=admin");
  }

  return (
    <div className="animate-stagger space-y-6">
      <PageHeader
        title="ماژول‌ها و پوشه‌ها"
        subtitle="ماژول بسازید، پوشه تعریف کنید و محل هر گزارش را مدیریت کنید"
        actions={
          <Button asChild variant="outline">
            <Link href="/admin/reports">
              <FolderOpen className="h-4 w-4" />
              استودیو گزارش
            </Link>
          </Button>
        }
      />
      <ModulesManager />
    </div>
  );
}
