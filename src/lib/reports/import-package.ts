import { prisma } from "@/lib/db/prisma";
import { ensureModuleBySlug, setReportPlacement } from "@/lib/reports/organization";
import { upsertReportDefinition } from "@/lib/reports/registry";
import {
  reportPackageSchema,
  type ReportPackage,
} from "@/types/report-package";
import { normalizeDefinition } from "@/types/report";

export type ImportReportOptions = {
  userId?: string;
  /** When slug exists: skip | replace | rename */
  conflict?: "skip" | "replace" | "rename";
  moduleId?: string;
  folderId?: string | null;
  newSlug?: string;
  publish?: boolean;
  sourceType?: "studio" | "package" | "rdl";
  sourceRef?: string | null;
};

export type ImportReportResult = {
  ok: boolean;
  slug?: string;
  skipped?: boolean;
  version?: number;
  error?: string;
};

function parsePackageInput(raw: unknown): ReportPackage {
  const parsed = reportPackageSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`فرمت بسته نامعتبر: ${parsed.error.message}`);
  }
  return parsed.data;
}

export function parseReportPackageJson(text: string): ReportPackage {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("فایل JSON نامعتبر است");
  }
  return parsePackageInput(json);
}

export async function importReportPackage(
  pkg: unknown,
  options: ImportReportOptions = {},
): Promise<ImportReportResult> {
  const data = parsePackageInput(pkg);

  const conflict = options.conflict ?? "rename";
  const moduleId =
    options.moduleId ??
    data.report.placement?.moduleId ??
    data.report.definition.moduleId;

  const folderId =
    options.folderId !== undefined
      ? options.folderId
      : (data.report.placement?.folderId ?? null);

  let slug = options.newSlug ?? data.report.definition.id;
  if (!slug) throw new Error("شناسه گزارش در بسته خالی است");

  slug = slug.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "-");

  const existing = await prisma.report.findUnique({ where: { slug } });

  if (existing && conflict === "skip") {
    return { ok: true, skipped: true, slug };
  }

  if (existing && conflict === "rename") {
    let n = 2;
    while (
      await prisma.report.findUnique({ where: { slug: `${slug}-${n}` } })
    ) {
      n += 1;
    }
    slug = `${slug}-${n}`;
  }

  await ensureModuleBySlug(moduleId);

  const definition = normalizeDefinition({
    ...data.report.definition,
    id: slug,
    moduleId,
    sqlSource: { mode: "inline" as const, text: data.report.sqlText },
    sql: data.report.sqlText,
  });

  const result = await upsertReportDefinition(definition, {
    publish: options.publish ?? true,
    note: `imported from package ${data.exportedAt}`,
    userId: options.userId,
    sqlInline: true,
    folderId,
    sourceType: options.sourceType ?? "package",
    sourceRef: options.sourceRef ?? data.exportNote ?? null,
  });

  if (folderId !== undefined) {
    await setReportPlacement(slug, moduleId, folderId);
  }

  return { ok: true, slug, version: result.version };
}
