"use client";

import { useCallback, useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

type ProviderSummary = {
  key: string;
  nameFa: string;
  engine: string;
  configured: boolean;
  requiredEnvVars: Array<{ key: string; labelFa: string }>;
};

export function DatasourceHealthPanel() {
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<
    Record<string, { ok: boolean; message: string }>
  >({});
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/datasources");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "خطا");
      setProviders(data.providers ?? []);
      setLoaded(true);
    } catch {
      setProviders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  async function testProvider(key: string) {
    setTesting(key);
    try {
      const res = await fetch("/api/admin/datasources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const data = await res.json();
      setTestResults((prev) => ({
        ...prev,
        [key]: { ok: Boolean(data.ok), message: data.message ?? "" },
      }));
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [key]: {
          ok: false,
          message: err instanceof Error ? err.message : "خطا",
        },
      }));
    } finally {
      setTesting(null);
    }
  }

  if (!loaded) {
    return (
      <section className="surface-panel">
        <div className="surface-panel-header">
          <p className="section-title">منابع داده</p>
          <p className="section-desc">
            وضعیت اتصال ERP و دیتابیس‌های سازمانی (read-only)
          </p>
        </div>
        <div className="surface-panel-body">
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            نمایش وضعیت اتصال
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="surface-panel">
      <div className="surface-panel-header flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="section-title">منابع داده</p>
          <p className="section-desc">
            اتصال‌ها از متغیرهای محیطی خوانده می‌شوند — پس از تغییر env سرور را
            ری‌استارت کنید.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          بروزرسانی
        </Button>
      </div>
      <div className="surface-panel-body space-y-4">
        {providers.map((p) => {
          const test = testResults[p.key];
          return (
            <div
              key={p.key}
              className="rounded-[var(--radius)] border border-[var(--border)] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{p.nameFa}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {p.key} · {p.engine}
                  </p>
                  <span
                    className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                      p.configured
                        ? "bg-[var(--success-soft)] text-[var(--success)]"
                        : "bg-[var(--surface-muted)] text-[var(--muted)]"
                    }`}
                  >
                    {p.configured ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      <XCircle className="h-3 w-3" />
                    )}
                    {p.configured ? "پیکربندی شده" : "پیکربندی نشده"}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!p.configured || testing === p.key}
                  onClick={() => void testProvider(p.key)}
                >
                  {testing === p.key ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  تست اتصال
                </Button>
              </div>
              {test ? (
                <p
                  className={`mt-3 text-sm ${test.ok ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
                >
                  {test.message}
                </p>
              ) : null}
              <ul className="mt-3 space-y-1 text-xs text-[var(--muted)]">
                {p.requiredEnvVars.map((v) => (
                  <li key={v.key}>
                    <code dir="ltr">{v.key}</code> — {v.labelFa}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
