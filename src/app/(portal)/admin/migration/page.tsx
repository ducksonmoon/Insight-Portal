import { redirect } from "next/navigation";

import { MigrationDashboard } from "@/components/admin/migration-dashboard";
import { auth } from "@/lib/auth/auth";

export const dynamic = "force-dynamic";

export default async function MigrationPage() {
  const session = await auth();
  if (!session?.user?.isAdmin) redirect("/");

  return <MigrationDashboard />;
}
