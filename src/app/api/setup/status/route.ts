import { NextResponse } from "next/server";

import {
  getBranding,
  isSetupComplete,
} from "@/lib/branding/settings";

export async function GET() {
  try {
    const [complete, branding] = await Promise.all([
      isSetupComplete(),
      getBranding(),
    ]);
    return NextResponse.json({
      setupComplete: complete,
      branding: {
        companyNameFa: branding.companyNameFa,
        companyNameEn: branding.companyNameEn,
        appNameFa: branding.appNameFa,
        appNameEn: branding.appNameEn,
        logoUrl: branding.logoUrl,
        faviconUrl: branding.faviconUrl,
        primaryColor: branding.primaryColor,
        accentColor: branding.accentColor,
        mark: branding.mark,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "خطا";
    return NextResponse.json({ error: message, setupComplete: false }, { status: 500 });
  }
}
