export default function PortalLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 rounded-[var(--radius)] bg-[var(--surface-muted)]" />
      <div className="h-4 w-72 max-w-full rounded bg-[var(--surface-muted)]" />
      <div className="surface-panel p-6">
        <div className="space-y-3">
          <div className="h-10 rounded-[var(--radius)] bg-[var(--surface-muted)]" />
          <div className="h-10 rounded-[var(--radius)] bg-[var(--surface-muted)]" />
          <div className="h-32 rounded-[var(--radius)] bg-[var(--surface-muted)]" />
        </div>
      </div>
    </div>
  );
}
