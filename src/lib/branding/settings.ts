import { prisma } from "@/lib/db/prisma";

export const SETUP_COOKIE = "insight_portal_ready";
export const SETTINGS_ID = "default";

export type Branding = {
  setupComplete: boolean;
  companyNameFa: string;
  companyNameEn: string;
  appNameFa: string;
  appNameEn: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  accentColor: string;
  supportEmail: string | null;
  supportPhone: string | null;
  /** Short mark shown when no logo (1–3 chars) */
  mark: string;
};

export function defaultBranding(): Branding {
  const company =
    process.env.NEXT_PUBLIC_COMPANY_NAME?.trim() ||
    process.env.NEXT_PUBLIC_APP_NAME?.trim() ||
    "شرکت شما";
  const app =
    process.env.NEXT_PUBLIC_APP_NAME?.trim() || "Insight Portal";

  return {
    setupComplete: false,
    companyNameFa: company,
    companyNameEn: company,
    appNameFa: "پورتال مدیریتی",
    appNameEn: app,
    logoUrl: null,
    faviconUrl: null,
    primaryColor: "#1e4d7b",
    accentColor: "#0d7a6f",
    supportEmail: null,
    supportPhone: null,
    mark: makeMark(company, app),
  };
}

export function makeMark(companyFa: string, appEn: string): string {
  const source = (companyFa || appEn || "IP").trim();
  if (!source) return "IP";
  // Prefer Latin initials if present
  const latin = source.match(/[A-Za-z0-9]+/g);
  if (latin?.length) {
    return latin
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("")
      .slice(0, 3);
  }
  return source.slice(0, 2);
}

function toBranding(row: {
  setupComplete: boolean;
  companyNameFa: string;
  companyNameEn: string | null;
  appNameFa: string;
  appNameEn: string;
  logoPath: string | null;
  faviconPath: string | null;
  primaryColor: string;
  accentColor: string;
  supportEmail: string | null;
  supportPhone: string | null;
}): Branding {
  const companyNameFa = row.companyNameFa || "شرکت شما";
  const appNameEn = row.appNameEn || "Insight Portal";
  return {
    setupComplete: row.setupComplete,
    companyNameFa,
    companyNameEn: row.companyNameEn ?? "",
    appNameFa: row.appNameFa || "پورتال مدیریتی",
    appNameEn,
    logoUrl: row.logoPath,
    faviconUrl: row.faviconPath,
    primaryColor: row.primaryColor || "#1e4d7b",
    accentColor: row.accentColor || "#0d7a6f",
    supportEmail: row.supportEmail,
    supportPhone: row.supportPhone,
    mark: makeMark(companyNameFa, appNameEn),
  };
}

/**
 * True when first-time setup finished, OR when an existing install
 * already has an admin (upgrade path without re-wizard).
 */
export async function isSetupComplete(): Promise<boolean> {
  try {
    const settings = await prisma.appSettings.findUnique({
      where: { id: SETTINGS_ID },
      select: { setupComplete: true },
    });
    if (settings?.setupComplete) return true;

    const adminCount = await prisma.user.count({
      where: { isAdmin: true, isActive: true },
    });
    if (adminCount > 0) {
      // Legacy install: mark setup complete with defaults so wizard is skipped
      await prisma.appSettings.upsert({
        where: { id: SETTINGS_ID },
        create: {
          id: SETTINGS_ID,
          setupComplete: true,
          companyNameFa:
            process.env.NEXT_PUBLIC_COMPANY_NAME?.trim() || "شرکت",
          companyNameEn: process.env.NEXT_PUBLIC_COMPANY_NAME?.trim() || null,
          appNameFa: "پورتال مدیریتی",
          appNameEn:
            process.env.NEXT_PUBLIC_APP_NAME?.trim() || "Insight Portal",
        },
        update: { setupComplete: true },
      });
      return true;
    }
    return false;
  } catch {
    // DB not ready — don't block health/setup; treat as incomplete
    return false;
  }
}

export async function getBranding(): Promise<Branding> {
  try {
    const row = await prisma.appSettings.findUnique({
      where: { id: SETTINGS_ID },
    });
    if (!row) return defaultBranding();
    return toBranding(row);
  } catch {
    return defaultBranding();
  }
}

export type BrandingUpdateInput = {
  companyNameFa: string;
  companyNameEn?: string | null;
  appNameFa?: string;
  appNameEn?: string;
  primaryColor?: string;
  accentColor?: string;
  supportEmail?: string | null;
  supportPhone?: string | null;
  logoPath?: string | null;
  faviconPath?: string | null;
  setupComplete?: boolean;
};

export async function saveBranding(
  input: BrandingUpdateInput,
): Promise<Branding> {
  const row = await prisma.appSettings.upsert({
    where: { id: SETTINGS_ID },
    create: {
      id: SETTINGS_ID,
      setupComplete: Boolean(input.setupComplete),
      companyNameFa: input.companyNameFa.trim(),
      companyNameEn: input.companyNameEn?.trim() || null,
      appNameFa: input.appNameFa?.trim() || "پورتال مدیریتی",
      appNameEn: input.appNameEn?.trim() || "Insight Portal",
      primaryColor: input.primaryColor?.trim() || "#1e4d7b",
      accentColor: input.accentColor?.trim() || "#0d7a6f",
      supportEmail: input.supportEmail?.trim() || null,
      supportPhone: input.supportPhone?.trim() || null,
      logoPath: input.logoPath ?? null,
      faviconPath: input.faviconPath ?? null,
    },
    update: {
      ...(input.setupComplete !== undefined
        ? { setupComplete: input.setupComplete }
        : {}),
      companyNameFa: input.companyNameFa.trim(),
      companyNameEn: input.companyNameEn?.trim() || null,
      appNameFa: input.appNameFa?.trim() || "پورتال مدیریتی",
      appNameEn: input.appNameEn?.trim() || "Insight Portal",
      primaryColor: input.primaryColor?.trim() || "#1e4d7b",
      accentColor: input.accentColor?.trim() || "#0d7a6f",
      supportEmail: input.supportEmail?.trim() || null,
      supportPhone: input.supportPhone?.trim() || null,
      ...(input.logoPath !== undefined ? { logoPath: input.logoPath } : {}),
      ...(input.faviconPath !== undefined
        ? { faviconPath: input.faviconPath }
        : {}),
    },
  });

  return toBranding(row);
}
