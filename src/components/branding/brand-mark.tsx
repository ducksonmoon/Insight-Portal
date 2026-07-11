import type { Branding } from "@/lib/branding/settings";

type BrandMarkProps = {
  branding: Pick<Branding, "logoUrl" | "mark" | "primaryColor">;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
};

const sizes = {
  sm: "h-9 w-9 text-xs",
  md: "h-11 w-11 text-sm",
  lg: "h-14 w-14 text-lg",
  xl: "h-20 w-20 text-2xl",
};

export function BrandMark({
  branding,
  size = "md",
  className = "",
}: BrandMarkProps) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl font-bold text-white shadow-sm ${sizes[size]} ${className}`}
      style={{ background: branding.primaryColor }}
    >
      {branding.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={branding.logoUrl}
          alt=""
          className="h-full w-full object-contain bg-white"
        />
      ) : (
        branding.mark
      )}
    </div>
  );
}
