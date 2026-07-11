export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="skeleton-table space-y-2 p-4" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-9 animate-pulse rounded-lg bg-[var(--surface-muted)]"
          style={{ width: `${88 - (i % 3) * 12}%`, marginInlineStart: `${(i % 2) * 4}%` }}
        />
      ))}
    </div>
  );
}

export function PanelSkeleton() {
  return (
    <div className="space-y-3 p-4" aria-hidden>
      <div className="h-6 w-1/3 animate-pulse rounded bg-[var(--surface-muted)]" />
      <div className="h-32 animate-pulse rounded-xl bg-[var(--surface-muted)]" />
    </div>
  );
}
