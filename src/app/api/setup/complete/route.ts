import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";

import {
  isSetupComplete,
  saveBranding,
  SETUP_COOKIE,
} from "@/lib/branding/settings";
import { saveBrandingUpload } from "@/lib/branding/upload";
import { prisma } from "@/lib/db/prisma";

const bodySchema = z.object({
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
  supportEmail: z.string().max(120).optional().nullable(),
  supportPhone: z.string().max(40).optional().nullable(),
  adminUsername: z.string().min(3).max(64),
  adminPassword: z.string().min(8).max(128),
  adminDisplayName: z.string().min(2).max(120).optional(),
});

export async function POST(request: NextRequest) {
  try {
    if (await isSetupComplete()) {
      return NextResponse.json(
        { error: "نصب اولیه قبلاً انجام شده است. از تنظیمات ادمین استفاده کنید." },
        { status: 403 },
      );
    }

    const form = await request.formData();
    const raw = {
      companyNameFa: String(form.get("companyNameFa") ?? ""),
      companyNameEn: String(form.get("companyNameEn") ?? "") || null,
      appNameFa: String(form.get("appNameFa") ?? "") || undefined,
      appNameEn: String(form.get("appNameEn") ?? "") || undefined,
      primaryColor: String(form.get("primaryColor") ?? "") || undefined,
      accentColor: String(form.get("accentColor") ?? "") || undefined,
      supportEmail: String(form.get("supportEmail") ?? "") || null,
      supportPhone: String(form.get("supportPhone") ?? "") || null,
      adminUsername: String(form.get("adminUsername") ?? ""),
      adminPassword: String(form.get("adminPassword") ?? ""),
      adminDisplayName: String(form.get("adminDisplayName") ?? "") || undefined,
    };

    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "ورودی نامعتبر", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    let logoPath: string | null = null;
    let faviconPath: string | null = null;

    const logo = form.get("logo");
    if (logo instanceof File && logo.size > 0) {
      logoPath = await saveBrandingUpload(logo, "logo");
    }

    const favicon = form.get("favicon");
    if (favicon instanceof File && favicon.size > 0) {
      faviconPath = await saveBrandingUpload(favicon, "favicon");
    }

    const hash = await bcrypt.hash(parsed.data.adminPassword, 10);
    const username = parsed.data.adminUsername.trim().toLowerCase();

    await prisma.$transaction(async (tx) => {
      await tx.user.upsert({
        where: { username },
        create: {
          username,
          displayName:
            parsed.data.adminDisplayName?.trim() ||
            parsed.data.companyNameFa.trim(),
          passwordHash: hash,
          isAdmin: true,
          isActive: true,
        },
        update: {
          passwordHash: hash,
          isAdmin: true,
          isActive: true,
          displayName:
            parsed.data.adminDisplayName?.trim() ||
            parsed.data.companyNameFa.trim(),
        },
      });
    });

    const branding = await saveBranding({
      companyNameFa: parsed.data.companyNameFa,
      companyNameEn: parsed.data.companyNameEn,
      appNameFa: parsed.data.appNameFa,
      appNameEn: parsed.data.appNameEn,
      primaryColor: parsed.data.primaryColor,
      accentColor: parsed.data.accentColor,
      supportEmail: parsed.data.supportEmail?.trim() || null,
      supportPhone: parsed.data.supportPhone,
      logoPath,
      faviconPath,
      setupComplete: true,
    });

    // Seed baseline modules/datasource if empty (non-blocking for incomplete seed)
    try {
      await prisma.dataSource.upsert({
        where: { slug: "rahkaran" },
        create: {
          slug: "rahkaran",
          nameFa: "راهکاران",
          type: "sqlserver",
          providerKey: "rahkaran",
        },
        update: {},
      });
    } catch {
      /* ignore */
    }

    const response = NextResponse.json({
      ok: true,
      branding,
      adminUsername: username,
    });

    response.cookies.set(SETUP_COOKIE, "1", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365 * 5,
    });

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "خطا در نصب";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
