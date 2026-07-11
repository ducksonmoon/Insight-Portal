import { redirect } from "next/navigation";

import { BrandingSettingsForm } from "@/components/admin/branding-settings-form";
import { auth } from "@/lib/auth/auth";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!session.user.isAdmin) redirect("/?denied=admin");

  return <BrandingSettingsForm />;
}
