"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";

type SearchResult = {
  slug: string;
  nameFa: string;
  moduleId: string;
  parameterCount: number;
};

type ReportSearchProps = {
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
};

export function ReportSearch({
  className = "",
  placeholder = "جستجوی گزارش…",
  autoFocus = false,
}: ReportSearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/dashboard/search?q=${encodeURIComponent(q)}&limit=12`,
      );
      const data = await res.json();
      setResults(data.results ?? []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void search(query), 250);
    return () => clearTimeout(t);
  }, [query, search]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <div className="relative">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
        <input
          type="search"
          className="input-field w-full pr-9"
          placeholder={placeholder}
          value={query}
          autoFocus={autoFocus}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && results[0]) {
              router.push(`/reports/${results[0].slug}`);
              setOpen(false);
              setQuery("");
            }
            if (e.key === "Escape") setOpen(false);
          }}
        />
        {loading ? (
          <Loader2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[var(--muted)]" />
        ) : null}
      </div>

      {open && query.trim() ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)]">
          {results.length ? (
            results.map((r) => (
              <Link
                key={r.slug}
                href={`/reports/${r.slug}`}
                className="block border-b border-[var(--border)] px-3 py-2.5 text-sm last:border-0 hover:bg-[var(--surface-muted)]"
                onClick={() => {
                  setOpen(false);
                  setQuery("");
                }}
              >
                <p className="font-semibold text-[var(--foreground)]">{r.nameFa}</p>
                <p className="text-xs text-[var(--muted)]">
                  {r.moduleId} · {r.parameterCount} فیلتر
                </p>
              </Link>
            ))
          ) : (
            <p className="px-3 py-4 text-center text-sm text-[var(--muted)]">
              {loading ? "در حال جستجو…" : "نتیجه‌ای یافت نشد"}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
