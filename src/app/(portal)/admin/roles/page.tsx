import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/auth";

export const dynamic = "force-dynamic";

export default async function RolesPage() {
  const session = await auth();
  if (!session?.user?.isAdmin) redirect("/");
  redirect("/access?tab=roles");
}
