import type { Metadata } from "next";
import { Suspense } from "react";

import "@fontsource/vazirmatn/400.css";
import "@fontsource/vazirmatn/500.css";
import "@fontsource/vazirmatn/600.css";
import "@fontsource/vazirmatn/700.css";

import { AuthProvider } from "@/components/providers/auth-provider";
import { auth } from "@/lib/auth/auth";
import { getBranding } from "@/lib/branding/settings";

import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getBranding();
  return {
    title: {
      default: `${branding.appNameEn} | ${branding.companyNameFa}`,
      template: `%s | ${branding.appNameEn}`,
    },
    description: `${branding.appNameFa} — سامانه گزارش‌گیری ${branding.companyNameFa}`,
    icons: branding.faviconUrl
      ? { icon: branding.faviconUrl }
      : undefined,
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

  return (
    <html
      lang="fa"
      dir="rtl"
      className="h-full"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <body
        className="min-h-full bg-[var(--background)] font-sans antialiased"
        suppressHydrationWarning
      >
        <AuthProvider session={session}>
          <Suspense fallback={null}>{children}</Suspense>
        </AuthProvider>
      </body>
    </html>
  );
}
