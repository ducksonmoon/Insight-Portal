import type { Branding } from "@/lib/branding/settings";

/** CSS custom properties for the active company theme */
export function brandingStyleVars(
  branding: Branding,
): Record<string, string> {
  return {
    "--primary": branding.primaryColor,
    "--primary-hover": shadeColor(branding.primaryColor, -18),
    "--primary-soft": hexToRgba(branding.primaryColor, 0.12),
    "--accent": branding.accentColor,
    "--accent-soft": hexToRgba(branding.accentColor, 0.12),
  };
}

function hexToRgba(hex: string, alpha: number): string {
  const raw = hex.replace("#", "");
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  if (full.length !== 6) return `rgba(30, 77, 123, ${alpha})`;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function shadeColor(hex: string, percent: number): string {
  const raw = hex.replace("#", "");
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  if (full.length !== 6) return hex;
  const num = parseInt(full, 16);
  let r = (num >> 16) & 255;
  let g = (num >> 8) & 255;
  let b = num & 255;
  r = Math.min(255, Math.max(0, Math.round(r + (percent / 100) * 255)));
  g = Math.min(255, Math.max(0, Math.round(g + (percent / 100) * 255)));
  b = Math.min(255, Math.max(0, Math.round(b + (percent / 100) * 255)));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}
