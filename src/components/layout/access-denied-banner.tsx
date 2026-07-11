"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle } from "lucide-react";

const MESSAGES: Record<string, string> = {
  report:
    "به این گزارش دسترسی ندارید. برای دریافت مجوز با مدیر سیستم تماس بگیرید.",
  admin: "این بخش فقط برای مدیران سیستم در دسترس است.",
};

export function AccessDeniedBanner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const denied = searchParams.get("denied");
  const [visible, setVisible] = useState(Boolean(denied && MESSAGES[denied]));

  useEffect(() => {
    setVisible(Boolean(denied && MESSAGES[denied]));
  }, [denied]);

  if (!visible || !denied || !MESSAGES[denied]) return null;

  function dismiss() {
    setVisible(false);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("denied");
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : window.location.pathname);
  }

  return (
    <div className="alert alert-warning flex items-start justify-between gap-3" role="alert">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p className="text-sm">{MESSAGES[denied]}</p>
      </div>
      <button
        type="button"
        className="shrink-0 text-xs font-semibold text-[var(--warning)] hover:underline"
        onClick={dismiss}
      >
        بستن
      </button>
    </div>
  );
}
