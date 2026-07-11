import { redirect } from "next/navigation";

import { ReportStudio } from "@/components/admin/report-studio";
import { auth } from "@/lib/auth/auth";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditReportPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.isAdmin) redirect("/?denied=admin");
  const { id } = await params;
  return <ReportStudio mode="edit" initialId={id} />;
}
