import { prisma } from "@/lib/db/prisma";
import { getReportDefinition } from "@/lib/reports/registry";
import { resolveSqlText } from "@/lib/reports/sql-loader";
import {
  REPORT_PACKAGE_FORMAT,
  REPORT_PACKAGE_VERSION,
  type ReportPackage,
} from "@/types/report-package";
import { normalizeDefinition } from "@/types/report";

export async function buildReportPackage(
  reportSlug: string,
  exportNote?: string,
): Promise<ReportPackage | null> {
  const definition = await getReportDefinition(reportSlug);
  if (!definition) return null;

  let sqlText = "";
  try {
    sqlText = resolveSqlText(definition);
  } catch {
    sqlText = definition.sqlSource?.text ?? definition.sql ?? "";
  }

  let placement: ReportPackage["report"]["placement"];
  let publishedVersion: number | undefined;

  try {
    const row = await prisma.report.findUnique({
      where: { slug: reportSlug },
      select: {
        folderId: true,
        publishedVersion: true,
        module: { select: { slug: true } },
      },
    });
    if (row) {
      publishedVersion = row.publishedVersion;
      placement = {
        moduleId: row.module.slug,
        folderId: row.folderId,
      };
    }
  } catch {
    placement = { moduleId: definition.moduleId, folderId: null };
  }

  return {
    format: REPORT_PACKAGE_FORMAT,
    formatVersion: REPORT_PACKAGE_VERSION,
    exportedAt: new Date().toISOString(),
    exportNote,
    report: {
      definition: normalizeDefinition(definition),
      sqlText,
      placement,
      publishedVersion,
    },
  };
}
