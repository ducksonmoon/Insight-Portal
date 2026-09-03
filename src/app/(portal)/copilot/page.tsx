import { redirect } from "next/navigation";

import { CopilotPanel } from "@/components/copilot/copilot-panel";
import { auth } from "@/lib/auth/auth";

export const dynamic = "force-dynamic";

export default async function CopilotPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!session.user.isAdmin) redirect("/?denied=admin");

  return <CopilotPanel />;
}
