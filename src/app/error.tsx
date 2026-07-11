"use client";

import { useEffect } from "react";

import { SystemPageShell } from "@/components/layout/system-page-shell";
import { Button } from "@/components/ui/button";

export default function GlobalError({
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
      title="خطای سیستم"
      description="مشکلی در بارگذاری صفحه پیش آمد. دوباره تلاش کنید یا با پشتیبانی تماس بگیرید."
    >
      <Button type="button" onClick={() => reset()}>
        تلاش مجدد
      </Button>
    </SystemPageShell>
  );
}
