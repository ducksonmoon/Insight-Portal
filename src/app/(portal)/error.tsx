"use client";

import { useEffect } from "react";

import { SystemPageShell } from "@/components/layout/system-page-shell";
import { Button } from "@/components/ui/button";

export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <SystemPageShell
      code="۵۰۰"
      title="خطا در پورتال"
      description="بخشی از سامانه در دسترس نیست. اتصال دیتابیس یا تنظیمات سرور را بررسی کنید."
    >
      <Button type="button" onClick={() => reset()}>
        تلاش مجدد
      </Button>
    </SystemPageShell>
  );
}
