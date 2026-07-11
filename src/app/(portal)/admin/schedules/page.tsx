import { redirect } from "next/navigation";

import { SchedulesManager } from "@/components/admin/schedules-manager";
import { auth } from "@/lib/auth/auth";

export const dynamic = "force-dynamic";

export default async function SchedulesPage() {
  const session = await auth();
  if (!session?.user?.isAdmin) redirect("/");

  return <SchedulesManager />;
}
