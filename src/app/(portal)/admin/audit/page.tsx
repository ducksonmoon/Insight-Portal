import { redirect } from "next/navigation";

import { AuditLogViewer } from "@/components/admin/audit-log-viewer";
import { auth } from "@/lib/auth/auth";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const session = await auth();
  if (!session?.user?.isAdmin) redirect("/?denied=admin");

  return <AuditLogViewer />;
}
