import { z } from "zod";

import { reportDefinitionSchema } from "@/types/report";

/** Insight Portal report interchange format (.insight-report.json) */
export const REPORT_PACKAGE_FORMAT = "insight-portal-report" as const;
export const REPORT_PACKAGE_VERSION = 1 as const;

export const reportPackagePlacementSchema = z.object({
  moduleId: z.string().min(1),
  folderId: z.string().nullable().optional(),
});

export const reportPackageSchema = z.object({
  format: z.literal(REPORT_PACKAGE_FORMAT),
  formatVersion: z.literal(REPORT_PACKAGE_VERSION),
  exportedAt: z.string(),
  exportNote: z.string().optional(),
  report: z.object({
    definition: reportDefinitionSchema,
    sqlText: z.string(),
    placement: reportPackagePlacementSchema.optional(),
    publishedVersion: z.number().int().optional(),
  }),
});

export type ReportPackage = z.infer<typeof reportPackageSchema>;

export const REPORT_PACKAGE_EXTENSION = ".insight-report.json";

export function reportPackageFilename(slug: string): string {
  return `${slug}${REPORT_PACKAGE_EXTENSION}`;
}
