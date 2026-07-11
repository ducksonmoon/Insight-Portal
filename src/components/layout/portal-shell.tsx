"use client";

import { useEffect, useState } from "react";

import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { ToastProvider } from "@/components/ui/toast";
import type { Branding } from "@/lib/branding/settings";
import { brandingStyleVars } from "@/lib/branding/theme";

type PortalShellProps = {
  branding: Branding;
  children: React.ReactNode;
};

export function PortalShell({ branding, children }: PortalShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const vars = brandingStyleVars(branding);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [children]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileNavOpen]);

  return (
    <ToastProvider>
    <div className="portal-shell relative flex min-h-screen" style={vars}>
      <div className="portal-atmosphere pointer-events-none fixed inset-0 -z-10" />

      {mobileNavOpen ? (
        <button
          type="button"
          aria-label="بستن منو"
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}

      <AppSidebar
        branding={branding}
        mobileOpen={mobileNavOpen}
        onNavigate={() => setMobileNavOpen(false)}
      />

      <main className="flex min-h-screen min-w-0 flex-1 flex-col">
        <AppHeader
          branding={branding}
          onMenuClick={() => setMobileNavOpen((v) => !v)}
        />
        <div className="flex-1 p-4 md:p-6 lg:p-7">
          <div className="animate-enter mx-auto max-w-[1400px]">{children}</div>
        </div>
      </main>
    </div>
    </ToastProvider>
  );
}
