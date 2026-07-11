import { redirect } from "next/navigation";

import { RdlViewer } from "@/components/admin/rdl-viewer";
import { auth } from "@/lib/auth/auth";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function RdlDetailPage({ params }: Props) {
  const session = await auth();
  if (!session?.user?.isAdmin) redirect("/");

  const { id } = await params;

  return <RdlViewer rdlId={id} />;
}
