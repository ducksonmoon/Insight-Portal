import { prisma } from "@/lib/db/prisma";
import {
  DEFAULT_LOOKUP_CATALOGS,
  reportDefinitions as codeDefinitions,
} from "@/lib/reports/definitions";
import { resolveSqlText } from "@/lib/reports/sql-loader";
import {
  getPrimaryDataset,
  normalizeDefinition,
  reportDefinitionSchema,
  reportModules,
  type ReportDefinition,
} from "@/types/report";

function reportModulesFallbackName(slug: string): string | undefined {
  return reportModules.find((m) => m.id === slug)?.nameFa;
}

function parseDefinitionJson(raw: string | null | undefined): ReportDefinition | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ReportDefinition>;
    if (!parsed.id || !parsed.nameFa || !parsed.moduleId) return null;
    return normalizeDefinition(parsed as ReportDefinition);
  } catch {
    return null;
  }
}

async function loadFromPrisma(): Promise<ReportDefinition[] | null> {
  try {
    const rows = await prisma.report.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      include: { dataSource: true, module: true },
    });

    if (!rows.length) return null;

    const defs: ReportDefinition[] = [];
    for (const row of rows) {
      const fromJson = parseDefinitionJson(row.definition);
      if (fromJson) {
        // Prefer published inline SQL from DB for primary dataset when present
        if (row.sqlQuery || row.sqlFile) {
          const primary = getPrimaryDataset(fromJson);
          const nextSql = row.sqlQuery
            ? ({ mode: "inline" as const, text: row.sqlQuery })
            : ({ mode: "file" as const, path: row.sqlFile! });
          fromJson.datasets = fromJson.datasets.map((d) =>
            d.id === primary.id ? { ...d, sqlSource: nextSql } : d,
          );
          fromJson.sqlSource = nextSql;
          if (row.sqlQuery) fromJson.sql = row.sqlQuery;
          if (row.sqlFile) fromJson.sqlFile = row.sqlFile;
        }
        if (row.dataSource?.providerKey) {
          fromJson.dataSourceId = row.dataSource.providerKey;
        }
        defs.push(normalizeDefinition(fromJson));
        continue;
      }

      defs.push(
        normalizeDefinition({
          id: row.slug,
          nameFa: row.nameFa,
          moduleId: row.module.slug,
          dataSourceId: row.dataSource?.providerKey ?? "rahkaran",
          sqlFile: row.sqlFile ?? undefined,
          sql: row.sqlQuery ?? undefined,
          parameters: [],
          columns: [],
        }),
      );
    }
    return defs;
  } catch {
    // App DB unavailable — use code fallback
    return null;
  }
}

export async function listReportDefinitions(): Promise<ReportDefinition[]> {
  const fromDb = await loadFromPrisma();
  if (fromDb?.length) return fromDb;
  return codeDefinitions;
}

export async function getReportDefinition(
  id: string,
): Promise<ReportDefinition | undefined> {
  const all = await listReportDefinitions();
  return all.find((r) => r.id === id);
}

/** Sync: code-only lookup for places that cannot await (prefer async API) */
export function getReportByIdSync(id: string): ReportDefinition | undefined {
  return codeDefinitions.find((r) => r.id === id);
}

export async function upsertReportDefinition(
  definition: ReportDefinition,
  options?: {
    publish?: boolean;
    note?: string;
    userId?: string;
    sqlInline?: boolean;
    folderId?: string | null;
    sourceType?: "studio" | "package" | "rdl";
    sourceRef?: string | null;
  },
): Promise<{ reportId: string; version: number }> {
  const normalized = normalizeDefinition(definition);
  const parsed = reportDefinitionSchema.safeParse(normalized);
  if (!parsed.success) {
    throw new Error(`Invalid report definition: ${parsed.error.message}`);
  }

  const module = await prisma.reportModule.upsert({
    where: { slug: normalized.moduleId },
    create: {
      slug: normalized.moduleId,
      nameFa:
        reportModulesFallbackName(normalized.moduleId) ?? normalized.moduleId,
    },
    update: {},
  });

  let folderId: string | null = options?.folderId ?? null;
  if (folderId) {
    const folder = await prisma.reportFolder.findFirst({
      where: { id: folderId, moduleId: module.id, isActive: true },
    });
    if (!folder) folderId = null;
  }

  const dataSource = await prisma.dataSource.findUnique({
    where: { slug: normalized.dataSourceId },
  });

  const primary = getPrimaryDataset(normalized);
  let sqlQuery: string | null = null;
  let sqlFile: string | null = null;

  if (primary.sqlSource.mode === "inline" || options?.sqlInline) {
    sqlQuery = resolveSqlText(normalized);
    sqlFile =
      normalized.sqlFile ??
      primary.sqlSource.path ??
      normalized.sqlSource.path ??
      null;
  } else {
    sqlFile =
      primary.sqlSource.path ??
      normalized.sqlSource.path ??
      normalized.sqlFile ??
      null;
  }

  const definitionJson = JSON.stringify(normalized);

  const existing = await prisma.report.findUnique({
    where: { slug: normalized.id },
  });

  const nextVersion = (existing?.publishedVersion ?? 0) + (options?.publish ? 1 : 0) || 1;

  const sourceType = options?.sourceType ?? "studio";
  const sourceRef = options?.sourceRef ?? null;

  const report = await prisma.report.upsert({
    where: { slug: normalized.id },
    create: {
      slug: normalized.id,
      nameFa: normalized.nameFa,
      moduleId: module.id,
      folderId,
      dataSourceId: dataSource?.id,
      sqlFile,
      sqlQuery,
      definition: definitionJson,
      publishedVersion: 1,
      isActive: true,
      sourceType,
      sourceRef,
    },
    update: {
      nameFa: normalized.nameFa,
      moduleId: module.id,
      folderId,
      dataSourceId: dataSource?.id,
      sqlFile,
      sqlQuery,
      definition: definitionJson,
      publishedVersion: options?.publish
        ? nextVersion
        : existing?.publishedVersion ?? 1,
      isActive: true,
      ...(options?.sourceType ? { sourceType, sourceRef } : {}),
    },
  });

  if (options?.publish !== false) {
    const version = report.publishedVersion;
    await prisma.reportVersion.upsert({
      where: {
        reportId_version: { reportId: report.id, version },
      },
      create: {
        reportId: report.id,
        version,
        definition: definitionJson,
        sqlSnapshot: sqlQuery ?? (sqlFile ? resolveSqlText(normalized) : null),
        note: options?.note,
        createdBy: options?.userId,
      },
      update: {
        definition: definitionJson,
        sqlSnapshot: sqlQuery ?? undefined,
        note: options?.note,
      },
    });
  }

  return { reportId: report.id, version: report.publishedVersion };
}

export async function listLookupCatalogs() {
  try {
    const rows = await prisma.lookupCatalog.findMany({
      where: { isActive: true },
      orderBy: { nameFa: "asc" },
    });
    if (rows.length) return rows;
  } catch {
    /* fallback */
  }
  return DEFAULT_LOOKUP_CATALOGS.map((c) => ({
    id: c.slug,
    ...c,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
}

export async function resolveLookupSql(
  param: ReportDefinition["parameters"][number],
): Promise<string | null> {
  if (param.lookupSql) return param.lookupSql;
  if (!param.lookupCatalogSlug) return null;

  try {
    const catalog = await prisma.lookupCatalog.findUnique({
      where: { slug: param.lookupCatalogSlug },
    });
    if (catalog) return catalog.lookupSql;
  } catch {
    /* fallback */
  }

  const fallback = DEFAULT_LOOKUP_CATALOGS.find(
    (c) => c.slug === param.lookupCatalogSlug,
  );
  return fallback?.lookupSql ?? null;
}

export async function writeAuditLog(entry: {
  userId?: string | null;
  action: string;
  reportId?: string | null;
  reportSlug?: string;
  parameters?: unknown;
  durationMs?: number;
  success?: boolean;
  message?: string;
}) {
  try {
    let reportId = entry.reportId ?? null;
    if (!reportId && entry.reportSlug) {
      const report = await prisma.report.findUnique({
        where: { slug: entry.reportSlug },
        select: { id: true },
      });
      reportId = report?.id ?? null;
    }

    await prisma.auditLog.create({
      data: {
        userId: entry.userId ?? null,
        action: entry.action,
        reportId,
        parameters: entry.parameters
          ? JSON.stringify(entry.parameters)
          : null,
        durationMs: entry.durationMs,
        success: entry.success ?? true,
        message: entry.message,
      },
    });
  } catch {
    // Audit must never break report execution
  }
}
