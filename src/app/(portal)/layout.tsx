import { redirect } from "next/navigation";

import { PortalShell } from "@/components/layout/portal-shell";
import { getBranding, isSetupComplete } from "@/lib/branding/settings";

export const dynamic = "force-dynamic";

export default async function PortalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  if (!(await isSetupComplete())) {
    redirect("/setup");
  }

  const branding = await getBranding();

  return <PortalShell branding={branding}>{children}</PortalShell>;
}
