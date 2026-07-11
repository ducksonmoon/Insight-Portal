import { redirect } from "next/navigation";

import { CreateReportHub } from "@/components/admin/create-report-hub";
import { auth } from "@/lib/auth/auth";

type PageProps = {
  searchParams: Promise<{ mode?: string; module?: string }>;
};

export default async function NewReportPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.isAdmin) redirect("/");

  const params = await searchParams;

  return (
    <CreateReportHub mode={params.mode ?? null} moduleId={params.module ?? null} />
  );
}
