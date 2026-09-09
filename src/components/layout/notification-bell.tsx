"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

type NotificationRow = {
  id: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  title: string;
  body: string;
  linkHref: string | null;
  readAt: string | null;
  createdAt: string;
};

const SEVERITY_DOT: Record<NotificationRow["severity"], string> = {
  critical: "bg-[var(--danger)]",
  high: "bg-[var(--warning)]",
  medium: "bg-[var(--primary)]",
  low: "bg-[var(--muted)]",
  info: "bg-[var(--muted)]",
};

const POLL_MS = 60_000;

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications");
      const data = await res.json();
      if (res.ok) {
        setNotifications(data.notifications ?? []);
        setUnreadCount(data.unreadCount ?? 0);
      }
    } catch {
      // silent — a failed background poll shouldn't interrupt the user
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  async function openNotification(n: NotificationRow) {
    setOpen(false);
    if (!n.readAt) {
      setNotifications((prev) =>
        prev.map((row) => (row.id === n.id ? { ...row, readAt: new Date().toISOString() } : row)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
      fetch(`/api/notifications/${n.id}`, { method: "PATCH" }).catch(() => {});
    }
    if (n.linkHref) router.push(n.linkHref);
  }

  async function markAllRead() {
    setNotifications((prev) => prev.map((row) => ({ ...row, readAt: row.readAt ?? new Date().toISOString() })));
    setUnreadCount(0);
    try {
      await fetch("/api/notifications/read-all", { method: "POST" });
    } catch {
      await load();
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius)] border border-[var(--border)] text-[var(--primary)] hover:bg-[var(--surface-muted)]"
        aria-label="اعلان‌ها"
        onClick={() => setOpen((v) => !v)}
      >
        <Bell className="h-[18px] w-[18px]" />
        {unreadCount > 0 ? (
          <span className="absolute -top-1 -left-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--danger)] px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "۹+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-50 mt-2 w-[min(360px,90vw)] rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)]">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2.5">
            <p className="text-sm font-semibold text-[var(--foreground)]">اعلان‌ها</p>
            {unreadCount > 0 ? (
              <button
                type="button"
                className="flex items-center gap-1 text-xs font-semibold text-[var(--primary)] hover:underline"
                onClick={() => void markAllRead()}
              >
                <CheckCheck className="h-3.5 w-3.5" />
                علامت‌گذاری همه به‌عنوان خوانده‌شده
              </button>
            ) : null}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading && !notifications.length ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-[var(--primary)]" />
              </div>
            ) : notifications.length ? (
              notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => void openNotification(n)}
                  className={cn(
                    "flex w-full items-start gap-2 border-b border-[var(--border)] px-3 py-2.5 text-right text-sm last:border-0 hover:bg-[var(--surface-muted)]",
                    !n.readAt && "bg-[var(--primary-soft)]",
                  )}
                >
                  <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", SEVERITY_DOT[n.severity])} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-[var(--foreground)]">{n.title}</span>
                    <span className="mt-0.5 line-clamp-2 block text-xs text-[var(--muted)]">{n.body}</span>
                    <span className="mt-0.5 block text-[11px] text-[var(--muted)]">
                      {new Date(n.createdAt).toLocaleString("fa-IR")}
                    </span>
                  </span>
                </button>
              ))
            ) : (
              <p className="px-3 py-8 text-center text-sm text-[var(--muted)]">اعلانی وجود ندارد</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
