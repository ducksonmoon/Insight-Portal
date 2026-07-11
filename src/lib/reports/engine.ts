import sql from "mssql";
import { toGregorian } from "jalaali-js";

import { getDataSourceProvider } from "@/lib/reports/datasources";
import {
  getReportDefinition,
  resolveLookupSql,
  writeAuditLog,
} from "@/lib/reports/registry";
import {
  resolveDatasetSqlText,
  resolveSqlText,
} from "@/lib/reports/sql-loader";
import {
  getPrimaryDataset,
  isCompositeReport,
  type ReportDataset,
  type ReportDefinition,
  type ReportParameter,
} from "@/types/report";
import type {
  DatasetResult,
  EmbedResult,
  ExecuteReportResult,
} from "@/types/report-result";

export type { DatasetResult, EmbedResult, ExecuteReportResult };

const MAX_EMBED_DEPTH = 2;

function jalaliToGregorian(jy: number, jm: number, jd: number): Date {
  const { gy, gm, gd } = toGregorian(jy, jm, jd);
  return new Date(gy, gm - 1, gd);
}

function parseJalaliDate(value: string): Date | null {
  const normalized = value.trim().replace(/-/g, "/");
  const parts = normalized.split("/");
  if (parts.length !== 3) return null;
  const [jy, jm, jd] = parts.map(Number);
  if (!jy || !jm || !jd) return null;
  return jalaliToGregorian(jy, jm, jd);
}

function bindNull(request: sql.Request, name: string, param: ReportParameter) {
  if (param.type === "jalali-date" || param.type === "jalali-date-range") {
    request.input(name, sql.DateTime, null);
  } else if (param.type === "number") {
    request.input(name, sql.Decimal(38, 10), null);
  } else if (param.type === "boolean") {
    request.input(name, sql.Bit, null);
  } else {
    request.input(name, sql.NVarChar(sql.MAX), null);
  }
}

function bindSingle(
  request: sql.Request,
  name: string,
  param: ReportParameter,
  value: unknown,
) {
  if (value === null || value === undefined || value === "") {
    bindNull(request, name, param);
    return;
  }

  switch (param.type) {
    case "jalali-date":
    case "jalali-date-range": {
      const date = parseJalaliDate(String(value));
      request.input(name, sql.DateTime, date);
      break;
    }
    case "number": {
      const n = Number(value);
      request.input(
        name,
        sql.Decimal(38, 10),
        Number.isFinite(n) ? n : null,
      );
      break;
    }
    case "boolean": {
      const b =
        value === true ||
        value === 1 ||
        value === "1" ||
        value === "true" ||
        value === "بله";
      request.input(name, sql.Bit, b);
      break;
    }
    default:
      request.input(name, sql.NVarChar(sql.MAX), String(value));
  }
}

function bindParameter(
  request: sql.Request,
  param: ReportParameter,
  params: Record<string, unknown>,
): void {
  if (param.type === "jalali-date-range") {
    const startName = param.rangeStartName ?? "STARTDATE";
    const endName = param.rangeEndName ?? "ENDDATE";
    const rangeVal = params[param.name];
    let start: unknown = params[startName];
    let end: unknown = params[endName];

    if (rangeVal && typeof rangeVal === "object" && !Array.isArray(rangeVal)) {
      const obj = rangeVal as { start?: unknown; end?: unknown };
      start = obj.start ?? start;
      end = obj.end ?? end;
    } else if (typeof rangeVal === "string" && rangeVal.includes("|")) {
      const [s, e] = rangeVal.split("|");
      start = s;
      end = e;
    }

    bindSingle(request, startName, param, start);
    bindSingle(request, endName, param, end);
    return;
  }

  bindSingle(request, param.name, param, params[param.name]);
}

function bindAllParameters(
  request: sql.Request,
  parameters: ReportParameter[],
  params: Record<string, unknown>,
) {
  for (const param of parameters) {
    bindParameter(request, param, params);
  }
}

/** Bind params by name as NVarChar/Decimal when definition param missing (embed maps) */
function bindLooseParams(
  request: sql.Request,
  params: Record<string, unknown>,
) {
  for (const [name, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") {
      request.input(name, sql.NVarChar(sql.MAX), null);
    } else if (typeof value === "number") {
      request.input(name, sql.Decimal(38, 10), value);
    } else if (typeof value === "boolean") {
      request.input(name, sql.Bit, value);
    } else {
      request.input(name, sql.NVarChar(sql.MAX), String(value));
    }
  }
}

export type ExecuteOptions = {
  parameters?: Record<string, unknown>;
  page?: number;
  pageSize?: number;
  maxRows?: number;
  timeoutSec?: number;
  preview?: boolean;
  userId?: string | null;
  skipAudit?: boolean;
  /** Internal: embed recursion depth */
  _embedDepth?: number;
  /** Internal: cycle detection for embeds */
  _embedStack?: string[];
};

function makeJoinKey(row: Record<string, unknown>, fields: string[]): string {
  return fields.map((f) => String(row[f] ?? "")).join("\u0001");
}

async function queryDatasetRows(options: {
  definition: ReportDefinition;
  dataset: ReportDataset;
  params: Record<string, unknown>;
  maxRows: number;
  timeoutSec: number;
}): Promise<{ rows: Record<string, unknown>[]; truncated: boolean }> {
  const { definition, dataset, params, maxRows, timeoutSec } = options;
  const provider = getDataSourceProvider(definition.dataSourceId || "rahkaran");
  if (!provider.isConfigured()) {
    throw new Error(
      `Data source «${provider.key}» is not configured. Check environment variables.`,
    );
  }

  const sqlText = resolveDatasetSqlText(definition, dataset);
  const pool = await provider.getPool();
  const request = pool.request();
  (request as sql.Request & { timeout?: number }).timeout = timeoutSec * 1000;

  bindAllParameters(request, definition.parameters, params);
  // Also bind any extra mapped embed params not in definition.parameters
  const known = new Set(definition.parameters.map((p) => p.name));
  for (const p of definition.parameters) {
    if (p.type === "jalali-date-range") {
      known.add(p.rangeStartName ?? "STARTDATE");
      known.add(p.rangeEndName ?? "ENDDATE");
    }
  }
  const extras: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    if (!known.has(k)) extras[k] = v;
  }
  if (Object.keys(extras).length) {
    bindLooseParams(request, extras);
  }

  const result = await request.query(sqlText);
  const allRows = (result.recordset ?? []) as Record<string, unknown>[];
  const truncated = allRows.length > maxRows;
  const rows = truncated ? allRows.slice(0, maxRows) : allRows;
  return { rows, truncated };
}

function topologicalDatasets(datasets: ReportDataset[]): ReportDataset[] {
  const byId = new Map(datasets.map((d) => [d.id, d]));
  const visited = new Set<string>();
  const order: ReportDataset[] = [];

  function visit(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    const d = byId.get(id);
    if (!d) return;
    if (d.parentDatasetId && byId.has(d.parentDatasetId)) {
      visit(d.parentDatasetId);
    }
    order.push(d);
  }

  for (const d of datasets) visit(d.id);
  return order;
}

async function executeDatasets(
  definition: ReportDefinition,
  params: Record<string, unknown>,
  maxRows: number,
  timeoutSec: number,
): Promise<Record<string, DatasetResult>> {
  const ordered = topologicalDatasets(definition.datasets);
  const results: Record<string, DatasetResult> = {};

  // Run root datasets (no parent) in parallel
  const roots = ordered.filter((d) => !d.parentDatasetId);
  const children = ordered.filter((d) => d.parentDatasetId);

  await Promise.all(
    roots.map(async (dataset) => {
      const { rows, truncated } = await queryDatasetRows({
        definition,
        dataset,
        params,
        maxRows,
        timeoutSec,
      });
      results[dataset.id] = {
        id: dataset.id,
        nameFa: dataset.nameFa,
        columns: dataset.columns,
        rows,
        totalCount: rows.length,
        truncated,
        charts: dataset.charts,
        grouping: dataset.grouping,
      };
    }),
  );

  // Children: shared params + key-join against parent rows
  for (const dataset of children) {
    const { rows, truncated } = await queryDatasetRows({
      definition,
      dataset,
      params,
      maxRows,
      timeoutSec,
    });

    const parentKeyFields = dataset.parentKeyFields ?? [];
    const childKeyFields = dataset.childKeyFields ?? parentKeyFields;
    let childrenByParentKey: Record<string, Record<string, unknown>[]> | undefined;

    if (
      dataset.parentDatasetId &&
      parentKeyFields.length &&
      childKeyFields.length === parentKeyFields.length
    ) {
      childrenByParentKey = {};
      for (const row of rows) {
        const key = makeJoinKey(row, childKeyFields);
        if (!childrenByParentKey[key]) childrenByParentKey[key] = [];
        childrenByParentKey[key].push(row);
      }
    }

    results[dataset.id] = {
      id: dataset.id,
      nameFa: dataset.nameFa,
      columns: dataset.columns,
      rows,
      totalCount: rows.length,
      truncated,
      charts: dataset.charts,
      grouping: dataset.grouping,
      childrenByParentKey,
    };
  }

  return results;
}

function mapEmbedParameters(
  embed: NonNullable<ReportDefinition["embeds"]>[number],
  parentParams: Record<string, unknown>,
  parentPrimaryRows: Record<string, unknown>[],
): Record<string, unknown> {
  const mapped: Record<string, unknown> = { ...parentParams };
  const firstRow = parentPrimaryRows[0] ?? {};

  for (const [childParam, source] of Object.entries(embed.parameterMap)) {
    if (Object.prototype.hasOwnProperty.call(parentParams, source)) {
      mapped[childParam] = parentParams[source];
    } else if (Object.prototype.hasOwnProperty.call(firstRow, source)) {
      mapped[childParam] = firstRow[source];
    } else {
      mapped[childParam] = parentParams[source] ?? firstRow[source] ?? null;
    }
  }
  return mapped;
}

async function executeEmbeds(
  definition: ReportDefinition,
  params: Record<string, unknown>,
  datasetResults: Record<string, DatasetResult>,
  options: ExecuteOptions,
): Promise<Record<string, EmbedResult>> {
  const embeds = definition.embeds ?? [];
  if (!embeds.length) return {};

  const depth = options._embedDepth ?? 0;
  if (depth >= MAX_EMBED_DEPTH) {
    throw new Error(
      `Embed depth exceeded (max ${MAX_EMBED_DEPTH}) for report ${definition.id}`,
    );
  }

  const stack = options._embedStack ?? [];
  if (stack.includes(definition.id)) {
    throw new Error(
      `Circular embed detected: ${[...stack, definition.id].join(" → ")}`,
    );
  }

  const primary = getPrimaryDataset(definition);
  const primaryRows = datasetResults[primary.id]?.rows ?? [];
  const out: Record<string, EmbedResult> = {};

  for (const embed of embeds) {
    if (stack.includes(embed.reportSlug) || embed.reportSlug === definition.id) {
      throw new Error(
        `Circular embed: ${definition.id} → ${embed.reportSlug}`,
      );
    }

    const childParams = mapEmbedParameters(embed, params, primaryRows);
    const childResult = await executeReport(embed.reportSlug, {
      ...options,
      parameters: childParams,
      skipAudit: true,
      preview: options.preview,
      _embedDepth: depth + 1,
      _embedStack: [...stack, definition.id],
    });

    out[embed.id] = {
      id: embed.id,
      nameFa: embed.nameFa,
      reportSlug: embed.reportSlug,
      result: childResult,
    };
  }

  return out;
}

function paginateRows(
  rows: Record<string, unknown>[],
  page: number,
  pageSize: number,
) {
  const start = (page - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}

export async function executeReport(
  reportId: string,
  options: ExecuteOptions = {},
): Promise<ExecuteReportResult> {
  const started = Date.now();
  const definition = await getReportDefinition(reportId);
  if (!definition) {
    throw new Error(`Report not found: ${reportId}`);
  }

  const params = options.parameters ?? {};
  const maxRows =
    options.maxRows ??
    definition.validation?.maxRows ??
    (options.preview ? 100 : 10000);
  const timeoutSec =
    options.timeoutSec ??
    definition.validation?.queryTimeoutSec ??
    (options.preview ? 15 : 30);
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(
    maxRows,
    Math.max(1, options.pageSize ?? maxRows),
  );

  try {
    const datasetResults = await executeDatasets(
      definition,
      params,
      maxRows,
      timeoutSec,
    );

    const embedResults = await executeEmbeds(
      definition,
      params,
      datasetResults,
      options,
    );

    const primary = getPrimaryDataset(definition);
    const primaryResult = datasetResults[primary.id];
    const primaryRows = primaryResult?.rows ?? [];
    const truncated = Object.values(datasetResults).some((d) => d.truncated);
    const durationMs = Date.now() - started;

    if (!options.skipAudit) {
      await writeAuditLog({
        userId: options.userId,
        action: options.preview ? "report.preview" : "report.execute",
        reportSlug: definition.id,
        parameters: params,
        durationMs,
        success: true,
        message: truncated ? `truncated to ${maxRows} rows` : undefined,
      });
    }

    if (durationMs > 5000) {
      console.warn(
        `[report] ${definition.id} took ${durationMs}ms (datasets=${Object.keys(datasetResults).length})`,
      );
    }

    const composite = isCompositeReport(definition);

    return {
      rows: paginateRows(primaryRows, page, pageSize),
      totalCount: primaryRows.length,
      truncated,
      page,
      pageSize,
      columns: primaryResult?.columns ?? definition.columns,
      charts: primaryResult?.charts ?? definition.charts ?? [],
      grouping: primaryResult?.grouping ?? definition.grouping,
      reportName: definition.nameFa,
      durationMs,
      schemaVersion: definition.schemaVersion,
      ...(composite
        ? {
            datasets: datasetResults,
            embeds: Object.keys(embedResults).length
              ? embedResults
              : undefined,
            layout: definition.layout,
          }
        : {}),
    };
  } catch (error) {
    const durationMs = Date.now() - started;
    const message = error instanceof Error ? error.message : "Unknown error";
    if (!options.skipAudit) {
      await writeAuditLog({
        userId: options.userId,
        action: options.preview ? "report.preview" : "report.execute",
        reportSlug: definition.id,
        parameters: params,
        durationMs,
        success: false,
        message,
      });
    }
    throw error;
  }
}

export async function executeDefinitionPreview(
  definition: ReportDefinition,
  parameters: Record<string, unknown> = {},
  options?: {
    maxRows?: number;
    timeoutSec?: number;
    userId?: string | null;
    datasetId?: string;
  },
): Promise<ExecuteReportResult> {
  const started = Date.now();
  const maxRows = options?.maxRows ?? 100;
  const timeoutSec = options?.timeoutSec ?? 15;

  // Ensure draft has inline SQL for primary when provided
  const draft: ReportDefinition = {
    ...definition,
    datasets: definition.datasets.map((d) => {
      if (d.sqlSource.mode === "inline") return d;
      try {
        const text = resolveDatasetSqlText(definition, d);
        return { ...d, sqlSource: { mode: "inline" as const, text } };
      } catch {
        return d;
      }
    }),
  };

  // Sync primary sqlSource for resolveSqlText callers
  const primary = getPrimaryDataset(draft);
  draft.sqlSource = primary.sqlSource;

  const datasetResults = await executeDatasets(
    draft,
    parameters,
    maxRows,
    timeoutSec,
  );

  // Preview generally skips deep embeds unless layout references them —
  // still execute embeds at depth 0 for Studio test tab.
  let embedResults: Record<string, EmbedResult> = {};
  try {
    embedResults = await executeEmbeds(draft, parameters, datasetResults, {
      parameters,
      preview: true,
      skipAudit: true,
      userId: options?.userId,
      _embedDepth: 0,
      _embedStack: [],
      maxRows,
      timeoutSec,
    });
  } catch {
    // Embeds may reference unpublished reports during authoring
    embedResults = {};
  }

  const targetId = options?.datasetId ?? primary.id;
  const focus = datasetResults[targetId] ?? datasetResults[primary.id];
  const composite = isCompositeReport(draft);

  return {
    rows: focus?.rows ?? [],
    totalCount: focus?.rows.length ?? 0,
    truncated: focus?.truncated ?? false,
    page: 1,
    pageSize: focus?.rows.length ?? 0,
    columns: focus?.columns ?? draft.columns,
    charts: focus?.charts ?? draft.charts ?? [],
    grouping: focus?.grouping ?? draft.grouping,
    reportName: draft.nameFa,
    durationMs: Date.now() - started,
    schemaVersion: draft.schemaVersion,
    ...(composite
      ? {
          datasets: datasetResults,
          embeds: Object.keys(embedResults).length ? embedResults : undefined,
          layout: draft.layout,
        }
      : {}),
  };
}

export async function executeLookupSql(
  lookupSql: string,
  dataSourceId = "rahkaran",
): Promise<Array<{ Code: string; Label: string }>> {
  const provider = getDataSourceProvider(dataSourceId);
  const pool = await provider.getPool();
  const request = pool.request();
  (request as import("mssql").Request & { timeout?: number }).timeout = 15000;
  const result = await request.query(lookupSql);
  return result.recordset as Array<{ Code: string; Label: string }>;
}

export async function executeLookupForParam(
  report: ReportDefinition,
  paramName: string,
): Promise<Array<{ value: string; label: string }>> {
  const param = report.parameters.find((p) => p.name === paramName);
  if (!param) return [];
  const lookupSql = await resolveLookupSql(param);
  if (!lookupSql) return [];
  const rows = await executeLookupSql(lookupSql, report.dataSourceId);
  return rows.map((row) => ({
    value: String(row.Code ?? ""),
    label: String(row.Label ?? row.Code ?? ""),
  }));
}

/** @deprecated retained for callers that only need primary SQL resolution */
export { resolveSqlText };
