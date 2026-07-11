import Link from "next/link";

import { Button } from "@/components/ui/button";

type SystemPageShellProps = {
  code: string;
  title: string;
  description: string;
  children?: React.ReactNode;
};

export function SystemPageShell({
  code,
  title,
  description,
  children,
}: SystemPageShellProps) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="surface-panel w-full max-w-md animate-enter p-8 text-center">
        <p className="text-4xl font-bold text-[var(--primary)]">{code}</p>
        <h1 className="page-title mt-3">{title}</h1>
        <p className="page-subtitle mt-2">{description}</p>
        {children ? <div className="mt-6">{children}</div> : null}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link href="/">داشبورد</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/reports">گزارش‌ها</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
