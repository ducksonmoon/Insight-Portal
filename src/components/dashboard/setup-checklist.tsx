"use client";

import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";

import type { SetupChecklistItem } from "@/lib/dashboard/setup-checklist";

type SetupChecklistProps = {
  items: SetupChecklistItem[];
};

export function SetupChecklist({ items }: SetupChecklistProps) {
  const doneCount = items.filter((i) => i.done).length;
  const allDone = doneCount === items.length;

  if (allDone) {
    return (
      <section className="surface-panel border-[var(--success)] bg-[var(--success-soft)]">
        <div className="surface-panel-body flex items-center gap-3 text-sm text-[var(--success)]">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <p>
            <span className="font-bold">راه‌اندازی کامل شد.</span> همه مراحل اولیه
            انجام شده است.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="surface-panel">
      <div className="surface-panel-header">
        <p className="section-title">راه‌اندازی اولیه</p>
        <p className="section-desc">
          {doneCount} از {items.length} مرحله انجام شده — برای تحویل به مشتری این
          چک‌لیست را کامل کنید.
        </p>
      </div>
      <div className="surface-panel-body space-y-2">
        {items.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className="action-row group flex items-center gap-3"
          >
            {item.done ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-[var(--success)]" />
            ) : (
              <Circle className="h-5 w-5 shrink-0 text-[var(--muted)]" />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-semibold group-hover:text-[var(--primary)]">
                {item.title}
              </p>
              <p className="text-xs text-[var(--muted)]">{item.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
