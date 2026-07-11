"use client";

import { LogOut, Menu, UserCircle2 } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { ReportSearch } from "@/components/dashboard/report-search";
import type { Branding } from "@/lib/branding/settings";

const pageTitles: Record<string, string> = {
  "/": "داشبورد",
  "/reports": "گزارش‌ها",
  "/modules": "ماژول‌ها",
  "/access": "دسترسی‌ها",
  "/admin/reports": "استودیو گزارش",
  "/admin/rdl": "گزارش‌های RDL",
  "/admin/migration": "مهاجرت RDL",
  "/admin/audit": "گزارش ممیزی",
  "/admin/roles": "نقش‌ها",
  "/admin/schedules": "زمان‌بندی",
  "/settings": "تنظیمات برند",
  "/profile": "پروفایل",
  "/login": "ورود",
};

function resolveTitle(pathname: string) {
  if (pathname.startsWith("/admin/reports/") && pathname.endsWith("/edit")) {
    return "ویرایش گزارش";
  }
  if (pathname.startsWith("/admin/reports/new")) return "گزارش جدید";
  if (pathname.startsWith("/admin/rdl/")) return "جزئیات RDL";
  if (pathname.startsWith("/reports/")) return "اجرای گزارش";
  return pageTitles[pathname] ?? "پورتال";
}

type AppHeaderProps = {
  branding: Branding;
  onMenuClick?: () => void;
};

export function AppHeader({ branding, onMenuClick }: AppHeaderProps) {
  const { data } = useSession();
  const pathname = usePathname();
  const title = resolveTitle(pathname);

  return (
    <header className="sticky top-0 z-30 flex h-[68px] items-center justify-between border-b border-[var(--border)] bg-[var(--surface)]/90 px-4 backdrop-blur-md md:px-7">
      <div className="flex min-w-0 flex-1 items-center gap-3 md:gap-4">
        <button
          type="button"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius)] border border-[var(--border)] text-[var(--primary)] hover:bg-[var(--surface-muted)] lg:hidden"
          aria-label="باز کردن منو"
          onClick={onMenuClick}
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="hidden min-w-0 flex-1 md:block md:max-w-md">
          <ReportSearch />
        </div>
        <div className="min-w-0">
          <p className="hidden truncate text-xs text-[var(--muted)] md:block">
            {data?.user?.name
              ? `سلام ${data.user.name}`
              : branding.companyNameFa}
          </p>
          <h2 className="truncate text-base font-bold text-[var(--foreground)] md:text-lg">
            {title}
          </h2>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="hidden items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 sm:flex">
          <UserCircle2 className="h-4 w-4 text-[var(--primary)]" />
          <div className="leading-tight">
            <p className="text-xs font-semibold text-[var(--foreground)]">
              {data?.user?.name ?? "کاربر"}
            </p>
            <p className="text-[10px] text-[var(--muted)]">
              {data?.user?.isAdmin ? "مدیر سیستم" : "کاربر"}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">خروج</span>
        </Button>
      </div>
    </header>
  );
}
