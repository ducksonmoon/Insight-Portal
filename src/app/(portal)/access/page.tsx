import { redirect } from "next/navigation";

import { AccessManager } from "@/components/admin/access-manager";
import { auth } from "@/lib/auth/auth";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ tab?: string }>;
};

export default async function AccessPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    redirect("/");
  }

  const { tab } = await searchParams;
  const initialTab = tab === "roles" ? "roles" : "users";

  return <AccessManager initialTab={initialTab} />;
}
