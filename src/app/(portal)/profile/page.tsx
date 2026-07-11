import { redirect } from "next/navigation";

import { ProfileSettings } from "@/components/profile/profile-settings";
import { auth } from "@/lib/auth/auth";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return <ProfileSettings />;
}
