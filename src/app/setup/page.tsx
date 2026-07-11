import { redirect } from "next/navigation";

import { SetupWizard } from "@/components/setup/setup-wizard";
import { isSetupComplete } from "@/lib/branding/settings";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (await isSetupComplete()) {
    redirect("/login");
  }

  return <SetupWizard />;
}
