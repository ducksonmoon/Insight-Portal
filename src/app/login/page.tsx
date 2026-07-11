import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { ToastProvider } from "@/components/ui/toast";
import { getBranding, isSetupComplete } from "@/lib/branding/settings";
import { brandingStyleVars } from "@/lib/branding/theme";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getBranding();
  return {
    title: `ورود | ${branding.appNameEn}`,
    description: `ورود به ${branding.appNameFa} — ${branding.companyNameFa}`,
    icons: branding.faviconUrl
      ? { icon: branding.faviconUrl }
      : undefined,
  };
}

export default async function LoginPage() {
  if (!(await isSetupComplete())) {
    redirect("/setup");
  }

  const branding = await getBranding();
  const vars = brandingStyleVars(branding);

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden p-4 md:p-10"
      style={vars}
    >
      <div className="portal-atmosphere absolute inset-0" />
      <Suspense
        fallback={
          <div className="relative z-10 text-[var(--muted)]">
            در حال بارگذاری...
          </div>
        }
      >
        <ToastProvider>
          <LoginForm branding={branding} />
        </ToastProvider>
      </Suspense>
    </div>
  );
}
