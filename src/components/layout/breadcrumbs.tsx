import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  if (!items.length) return null;
  return (
    <nav className="mb-3 flex flex-wrap items-center gap-1 text-sm text-[var(--muted)]" aria-label="مسیر">
      {items.map((item, i) => (
        <span key={`${item.label}-${i}`} className="flex items-center gap-1">
          {i > 0 ? <ChevronLeft className="h-3.5 w-3.5" /> : null}
          {item.href ? (
            <Link href={item.href} className="hover:text-[var(--primary)]">
              {item.label}
            </Link>
          ) : (
            <span className="text-[var(--foreground)]">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
