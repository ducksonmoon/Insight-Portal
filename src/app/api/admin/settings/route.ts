import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/require-admin";
import { getBranding, saveBranding } from "@/lib/branding/settings";
import { saveBrandingUpload } from "@/lib/branding/upload";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const branding = await getBranding();
  return NextResponse.json({ branding });
}

const updateSchema = z.object({
  companyNameFa: z.string().min(2).max(120),
  companyNameEn: z.string().max(120).optional().nullable(),
  appNameFa: z.string().min(2).max(120).optional(),
  appNameEn: z.string().min(2).max(120).optional(),
  primaryColor: z
    .string()
    .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
    .optional(),
  accentColor: z
    .string()
    .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
    .optional(),
  supportEmail: z.string().optional().nullable(),
  supportPhone: z.string().max(40).optional().nullable(),
  clearLogo: z.boolean().optional(),
  clearFavicon: z.boolean().optional(),
});

export async function PUT(request: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const contentType = request.headers.get("content-type") ?? "";
    let logoPath: string | null | undefined;
    let faviconPath: string | null | undefined;
    let raw: Record<string, unknown>;

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      raw = {
        companyNameFa: String(form.get("companyNameFa") ?? ""),
        companyNameEn: String(form.get("companyNameEn") ?? "") || null,
        appNameFa: String(form.get("appNameFa") ?? "") || undefined,
        appNameEn: String(form.get("appNameEn") ?? "") || undefined,
        primaryColor: String(form.get("primaryColor") ?? "") || undefined,
        accentColor: String(form.get("accentColor") ?? "") || undefined,
        supportEmail: String(form.get("supportEmail") ?? "") || null,
        supportPhone: String(form.get("supportPhone") ?? "") || null,
        clearLogo: form.get("clearLogo") === "1",
        clearFavicon: form.get("clearFavicon") === "1",
      };

      const logo = form.get("logo");
      if (logo instanceof File && logo.size > 0) {
        logoPath = await saveBrandingUpload(logo, "logo");
      } else if (raw.clearLogo) {
        logoPath = null;
      }

      const favicon = form.get("favicon");
      if (favicon instanceof File && favicon.size > 0) {
        faviconPath = await saveBrandingUpload(favicon, "favicon");
      } else if (raw.clearFavicon) {
        faviconPath = null;
      }
    } else {
      raw = await request.json();
    }

    const parsed = updateSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "ورودی نامعتبر", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const branding = await saveBranding({
      companyNameFa: parsed.data.companyNameFa,
      companyNameEn: parsed.data.companyNameEn,
      appNameFa: parsed.data.appNameFa,
      appNameEn: parsed.data.appNameEn,
      primaryColor: parsed.data.primaryColor,
      accentColor: parsed.data.accentColor,
      supportEmail: parsed.data.supportEmail,
      supportPhone: parsed.data.supportPhone,
      ...(logoPath !== undefined ? { logoPath } : {}),
      ...(faviconPath !== undefined ? { faviconPath } : {}),
      setupComplete: true,
    });

    return NextResponse.json({ ok: true, branding });
  } catch (err) {
    const message = err instanceof Error ? err.message : "خطا در ذخیره";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
