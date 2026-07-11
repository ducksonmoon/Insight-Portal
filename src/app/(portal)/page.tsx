import { redirect } from "next/navigation";

import { DashboardHome } from "@/components/dashboard/dashboard-home";
import { auth } from "@/lib/auth/auth";
import { getBranding } from "@/lib/branding/settings";
import { getDashboardData } from "@/lib/dashboard/data";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const branding = await getBranding();
  const data = await getDashboardData({
    id: session.user.id,
    isAdmin: session.user.isAdmin,
    displayName: session.user.name,
  });

  return (
    <DashboardHome
      data={data}
      isAdmin={Boolean(session.user.isAdmin)}
      brandingName={branding.companyNameFa}
    />
  );
}
