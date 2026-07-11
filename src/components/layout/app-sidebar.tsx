"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { X } from "lucide-react";

import { BrandMark } from "@/components/branding/brand-mark";
import { mainNavigation, navGroupLabels } from "@/config/navigation";
import type { Branding } from "@/lib/branding/settings";
import { cn } from "@/lib/utils";

type AppSidebarProps = {
  branding: Branding;
  mobileOpen?: boolean;
  onNavigate?: () => void;
};

export function AppSidebar({
  branding,
  mobileOpen = false,
  onNavigate,
}: AppSidebarProps) {
  const pathname = usePathname();
  const { data } = useSession();
  const isAdmin = Boolean(data?.user?.isAdmin);

  const items = mainNavigation.filter(
    (item) => !item.adminOnly || isAdmin,
  );

  const groups = ["main", "reports", "admin", "account"] as const;

  return (
    <aside
      className={cn(
        "portal-sidebar fixed inset-y-0 right-0 z-50 flex w-[min(288px,88vw)] flex-col border-l border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)] transition-transform duration-300 ease-out lg:static lg:z-auto lg:w-[270px] lg:shrink-0 lg:translate-x-0 lg:shadow-none",
        mobileOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0",
      )}
    >
      <div className="border-b border-[var(--border)] px-5 py-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark branding={branding} size="md" />
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold text-[var(--foreground)]">
                {branding.companyNameFa}
              </h1>
              <p className="truncate text-xs text-[var(--muted)]">
                {branding.appNameFa}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-[var(--surface-muted)] lg:hidden"
            aria-label="بستن منو"
            onClick={onNavigate}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto p-3">
        {groups.map((group) => {
          const groupItems = items.filter((item) => (item.group ?? "main") === group);
          if (!groupItems.length) return null;

          return (
            <div key={group}>
              <p className="mb-2 px-3 text-[11px] font-semibold tracking-wide text-[var(--muted)]">
                {navGroupLabels[group]}
              </p>
              <div className="space-y-1">
                {groupItems.map((item) => {
                  const isActive =
                    item.href === "/"
                      ? pathname === "/"
                      : pathname === item.href ||
                        pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavigate}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-200",
                        isActive
                          ? "bg-[var(--primary)] text-white shadow-sm"
                          : "text-[var(--foreground)] hover:bg-[var(--surface-muted)]",
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-[18px] w-[18px] shrink-0",
                          isActive ? "text-white" : "text-[var(--primary)]",
                        )}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold leading-tight">
                          {item.title}
                        </span>
                        {item.description ? (
                          <span
                            className={cn(
                              "mt-0.5 block truncate text-[11px]",
                              isActive ? "text-white/75" : "text-[var(--muted)]",
                            )}
                          >
                            {item.description}
                          </span>
                        ) : null}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-[var(--border)] p-4">
        <div className="rounded-xl bg-[var(--primary-soft)] px-3 py-3 text-xs text-[var(--primary)]">
          <p className="font-semibold">اتصال داده‌های سازمانی</p>
          <p className="mt-1 leading-relaxed opacity-90">
            فقط خواندنی — بدون تغییر در داده‌های عملیاتی
          </p>
        </div>
      </div>
    </aside>
  );
}
