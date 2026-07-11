const SOURCE_LABELS: Record<string, string> = {
  studio: "استودیو",
  package: "بسته",
  rdl: "RDL",
};

export function ReportSourceBadge({
  sourceType,
}: {
  sourceType?: string | null;
}) {
  if (!sourceType || sourceType === "studio") return null;

  const label = SOURCE_LABELS[sourceType] ?? sourceType;

  return (
    <span className="inline-flex rounded-md bg-[var(--surface-muted)] px-2 py-0.5 text-xs font-medium text-[var(--muted)]">
      {label}
    </span>
  );
}
