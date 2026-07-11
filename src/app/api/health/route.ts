import { NextResponse } from "next/server";

import { isSetupComplete, getBranding } from "@/lib/branding/settings";
import { isRahkaranConfigured } from "@/lib/db/rahkaran";

export async function GET() {
  const [setupComplete, branding] = await Promise.all([
    isSetupComplete().catch(() => false),
    getBranding().catch(() => null),
  ]);

  return NextResponse.json({
    app: branding?.appNameEn ?? "insight-portal",
    company: branding?.companyNameFa ?? null,
    setupComplete,
    rahkaranConfigured: isRahkaranConfigured(),
    timestamp: new Date().toISOString(),
  });
}
