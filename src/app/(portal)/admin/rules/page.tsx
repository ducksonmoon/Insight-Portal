import { redirect } from "next/navigation";

import { RulesManager } from "@/components/admin/rules-manager";
import { auth } from "@/lib/auth/auth";

export const dynamic = "force-dynamic";

export default async function RulesPage() {
  const session = await auth();
  if (!session?.user?.isAdmin) redirect("/?denied=admin");

  return <RulesManager />;
}
