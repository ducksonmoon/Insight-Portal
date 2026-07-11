import { z } from "zod";

export type ReportParameterType =
  | "jalali-date"
  | "jalali-date-range"
  | "text"
  | "number"
  | "select"
  | "lookup"
  | "boolean";

export type ReportParameter = {
  name: string;
  label: string;
  type: ReportParameterType;
  required?: boolean;
  nullable?: boolean;
  /** Shared lookup catalog slug (preferred over inline lookupSql) */
  lookupCatalogSlug?: string;
  lookupSql?: string;
  options?: Array<{ value: string; label: string }>;
  /** For jalali-date-range: maps to two SQL params */
  rangeStartName?: string;
  rangeEndName?: string;
};

export type ReportColumn = {
  field: string;
  header: string;
  type: "string" | "number" | "date" | "boolean";
  width?: number;
  format?: string;
  pinned?: "left" | "right";
  align?: "start" | "center" | "end";
  hidden?: boolean;
  sort?: "asc" | "desc";
};

export type ReportGridConfig = {
  density?: "comfortable" | "compact";
  pageSize?: number;
  pageSizeOptions?: number[];
  pinFirstColumn?: boolean;
  showToolbar?: boolean;
  enableQuickFilter?: boolean;
};

export type ReportChart = {
  type: "bar" | "line" | "pie";
  title: string;
  xField: string;
  yField: string;
};

export type ReportSqlSource = {
  mode: "file" | "inline";
  /** Relative filename under src/lib/reports/sql/ when mode=file */
  path?: string;
  /** Full SQL text when mode=inline */
  text?: string;
};

export type ReportValidationConfig = {
  maxRows?: number;
  queryTimeoutSec?: number;
};

export type ReportDataset = {
  id: string;
  nameFa: string;
  sqlSource: ReportSqlSource;
  columns: ReportColumn[];
  charts?: ReportChart[];
  grouping?: {
    groupBy: string[];
    aggregates: Array<{ field: string; func: string; label: string }>;
  };
  /** Optional parent dataset for key-join nesting */
  parentDatasetId?: string;
  parentKeyFields?: string[];
  childKeyFields?: string[];
  gridConfig?: ReportGridConfig;
};

export type ReportEmbed = {
  id: string;
  nameFa: string;
  /** Published report slug to embed */
  reportSlug: string;
  /** childParam <- parentField or parentParam name */
  parameterMap: Record<string, string>;
};

export type ReportSection =
  | { type: "dataset"; datasetId: string; title?: string }
  | { type: "embed"; embedId: string; title?: string }
  | { type: "chart"; datasetId: string; chartIndex: number; title?: string };

/**
 * Canonical report definition.
 * schemaVersion 1 reports normalize to a single `main` dataset.
 * schemaVersion 2 may have multiple datasets, embeds, and an explicit layout.
 */
export type ReportDefinition = {
  schemaVersion: 1 | 2;
  id: string;
  nameFa: string;
  moduleId: string;
  dataSourceId: string;
  /** Primary / legacy SQL source (mirrors primary dataset) */
  sqlSource: ReportSqlSource;
  /** @deprecated use sqlSource; kept for backward compat */
  sql?: string;
  /** @deprecated use sqlSource.path */
  sqlFile?: string;
  parameters: ReportParameter[];
  /** Primary dataset columns (mirrors datasets[0]/main) */
  columns: ReportColumn[];
  charts?: ReportChart[];
  grouping?: {
    groupBy: string[];
    aggregates: Array<{ field: string; func: string; label: string }>;
  };
  validation?: ReportValidationConfig;
  datasets: ReportDataset[];
  embeds?: ReportEmbed[];
  layout: ReportSection[];
  gridConfig?: ReportGridConfig;
};

export type ReportModule = {
  id: string;
  nameFa: string;
  description?: string;
};

export const reportModules: ReportModule[] = [
  {
    id: "financial",
    nameFa: "گزارشات واحد مالی",
    description: "LC، بانک، سپرده، تسهیلات",
  },
  {
    id: "warehouse",
    nameFa: "انبار",
    description: "موجودی، خرید مواد اولیه",
  },
  {
    id: "maintenance",
    nameFa: "گزارشات نت",
    description: "نگهداری و تعمیرات",
  },
  {
    id: "hr",
    nameFa: "آموزش / پرسنل",
    description: "کارکرد، دستمزد",
  },
  {
    id: "settlement",
    nameFa: "تسویه حساب",
    description: "تسویه پرسنل",
  },
];

export const reportParameterSchema = z.object({
  name: z.string().min(1),
  label: z.string().min(1),
  type: z.enum([
    "jalali-date",
    "jalali-date-range",
    "text",
    "number",
    "select",
    "lookup",
    "boolean",
  ]),
  required: z.boolean().optional(),
  nullable: z.boolean().optional(),
  lookupCatalogSlug: z.string().optional(),
  lookupSql: z.string().optional(),
  options: z
    .array(z.object({ value: z.string(), label: z.string() }))
    .optional(),
  rangeStartName: z.string().optional(),
  rangeEndName: z.string().optional(),
});

export const reportColumnSchema = z.object({
  field: z.string().min(1),
  header: z.string().min(1),
  type: z.enum(["string", "number", "date", "boolean"]),
  width: z.number().optional(),
  format: z.string().optional(),
  pinned: z.enum(["left", "right"]).optional(),
  align: z.enum(["start", "center", "end"]).optional(),
  hidden: z.boolean().optional(),
  sort: z.enum(["asc", "desc"]).optional(),
});

export const reportGridConfigSchema = z.object({
  density: z.enum(["comfortable", "compact"]).optional(),
  pageSize: z.number().int().positive().optional(),
  pageSizeOptions: z.array(z.number().int().positive()).optional(),
  pinFirstColumn: z.boolean().optional(),
  showToolbar: z.boolean().optional(),
  enableQuickFilter: z.boolean().optional(),
});

export const reportChartSchema = z.object({
  type: z.enum(["bar", "line", "pie"]),
  title: z.string(),
  xField: z.string(),
  yField: z.string(),
});

export const reportSqlSourceSchema = z.object({
  mode: z.enum(["file", "inline"]),
  path: z.string().optional(),
  text: z.string().optional(),
});

export const reportDatasetSchema = z.object({
  id: z.string().min(1),
  nameFa: z.string().min(1),
  sqlSource: reportSqlSourceSchema,
  columns: z.array(reportColumnSchema),
  charts: z.array(reportChartSchema).optional(),
  grouping: z
    .object({
      groupBy: z.array(z.string()),
      aggregates: z.array(
        z.object({
          field: z.string(),
          func: z.string(),
          label: z.string(),
        }),
      ),
    })
    .optional(),
  parentDatasetId: z.string().optional(),
  parentKeyFields: z.array(z.string()).optional(),
  childKeyFields: z.array(z.string()).optional(),
  gridConfig: reportGridConfigSchema.optional(),
});

export const reportEmbedSchema = z.object({
  id: z.string().min(1),
  nameFa: z.string().min(1),
  reportSlug: z.string().min(1),
  parameterMap: z.record(z.string(), z.string()),
});

export const reportSectionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("dataset"),
    datasetId: z.string().min(1),
    title: z.string().optional(),
  }),
  z.object({
    type: z.literal("embed"),
    embedId: z.string().min(1),
    title: z.string().optional(),
  }),
  z.object({
    type: z.literal("chart"),
    datasetId: z.string().min(1),
    chartIndex: z.number().int().nonnegative(),
    title: z.string().optional(),
  }),
]);

const groupingSchema = z
  .object({
    groupBy: z.array(z.string()),
    aggregates: z.array(
      z.object({
        field: z.string(),
        func: z.string(),
        label: z.string(),
      }),
    ),
  })
  .optional();

/** Loose input accepted by Studio / APIs before normalize */
export const reportDefinitionInputSchema = z
  .object({
    schemaVersion: z.union([z.literal(1), z.literal(2)]).optional(),
    id: z.string().min(1),
    nameFa: z.string().min(1),
    moduleId: z.string().min(1),
    dataSourceId: z.string().min(1).optional(),
    sqlSource: reportSqlSourceSchema.optional(),
    sql: z.string().optional(),
    sqlFile: z.string().optional(),
    parameters: z.array(reportParameterSchema).optional(),
    columns: z.array(reportColumnSchema).optional(),
    charts: z.array(reportChartSchema).optional(),
    grouping: groupingSchema,
    validation: z
      .object({
        maxRows: z.number().optional(),
        queryTimeoutSec: z.number().optional(),
      })
      .optional(),
    datasets: z.array(reportDatasetSchema).optional(),
    embeds: z.array(reportEmbedSchema).optional(),
    layout: z.array(reportSectionSchema).optional(),
    gridConfig: reportGridConfigSchema.optional(),
  })
  .passthrough();

export const reportDefinitionSchema = z.object({
  schemaVersion: z.union([z.literal(1), z.literal(2)]),
  id: z.string().min(1),
  nameFa: z.string().min(1),
  moduleId: z.string().min(1),
  dataSourceId: z.string().min(1),
  sqlSource: reportSqlSourceSchema,
  sql: z.string().optional(),
  sqlFile: z.string().optional(),
  parameters: z.array(reportParameterSchema),
  columns: z.array(reportColumnSchema),
  charts: z.array(reportChartSchema).optional(),
  grouping: groupingSchema,
  validation: z
    .object({
      maxRows: z.number().optional(),
      queryTimeoutSec: z.number().optional(),
    })
    .optional(),
  datasets: z.array(reportDatasetSchema),
  embeds: z.array(reportEmbedSchema).optional(),
  layout: z.array(reportSectionSchema),
  gridConfig: reportGridConfigSchema.optional(),
});

function buildSqlSource(input: {
  sqlSource?: ReportSqlSource;
  sql?: string;
  sqlFile?: string;
}): ReportSqlSource {
  if (input.sqlSource) return input.sqlSource;
  if (input.sql) return { mode: "inline", text: input.sql };
  if (input.sqlFile) return { mode: "file", path: input.sqlFile };
  return { mode: "inline", text: "" };
}

function primaryDatasetId(datasets: ReportDataset[]): string {
  const main = datasets.find((d) => d.id === "main") ?? datasets[0];
  return main?.id ?? "main";
}

/**
 * Normalize legacy / partial definitions into a canonical document.
 * Always ensures datasets[] + layout[] exist; mirrors primary onto top-level fields.
 */
export function normalizeDefinition(
  input: Partial<ReportDefinition> & {
    id: string;
    nameFa: string;
    moduleId: string;
  },
): ReportDefinition {
  const sqlSource = buildSqlSource(input);
  const parameters = input.parameters ?? [];
  const columns = input.columns ?? [];
  const charts = input.charts ?? [];
  const grouping = input.grouping;
  const validation = input.validation ?? {
    maxRows: 10000,
    queryTimeoutSec: 30,
  };

  let datasets: ReportDataset[] =
    input.datasets && input.datasets.length > 0
      ? input.datasets.map((d) => ({
          ...d,
          sqlSource: buildSqlSource(d),
          columns: d.columns ?? [],
          charts: d.charts ?? [],
        }))
      : [
          {
            id: "main",
            nameFa: input.nameFa || "اصلی",
            sqlSource,
            columns,
            charts,
            grouping,
          },
        ];

  // Keep primary dataset in sync when top-level SQL/columns edited (Studio v1 path)
  if (!input.datasets?.length || datasets.length === 1) {
    const pid = primaryDatasetId(datasets);
    datasets = datasets.map((d) =>
      d.id === pid
        ? {
            ...d,
            sqlSource:
              input.sqlSource || input.sql || input.sqlFile
                ? sqlSource
                : d.sqlSource,
            columns: input.columns?.length ? columns : d.columns,
            charts: input.charts ? charts : d.charts,
            grouping: input.grouping !== undefined ? grouping : d.grouping,
            nameFa: d.nameFa || input.nameFa || "اصلی",
          }
        : d,
    );
  } else if (input.sqlSource || input.sql || input.sqlFile) {
    // Explicit top-level SQL update on multi-dataset → update primary only
    const pid = primaryDatasetId(datasets);
    datasets = datasets.map((d) =>
      d.id === pid ? { ...d, sqlSource } : d,
    );
  }

  const primary =
    datasets.find((d) => d.id === "main") ??
    datasets.find((d) => !d.parentDatasetId) ??
    datasets[0];

  const embeds = input.embeds ?? [];

  let layout: ReportSection[] =
    input.layout && input.layout.length > 0
      ? input.layout
      : [
          ...datasets.map(
            (d): ReportSection => ({
              type: "dataset",
              datasetId: d.id,
              title: d.nameFa,
            }),
          ),
          ...embeds.map(
            (e): ReportSection => ({
              type: "embed",
              embedId: e.id,
              title: e.nameFa,
            }),
          ),
        ];

  const isComposite =
    datasets.length > 1 ||
    embeds.length > 0 ||
    (input.layout?.length ?? 0) > 1 ||
    input.schemaVersion === 2;

  const schemaVersion: 1 | 2 =
    input.schemaVersion === 2 || isComposite ? 2 : 1;

  const primarySql = primary?.sqlSource ?? sqlSource;

  return {
    schemaVersion,
    id: input.id,
    nameFa: input.nameFa,
    moduleId: input.moduleId,
    dataSourceId: input.dataSourceId ?? "rahkaran",
    sqlSource: primarySql,
    sql: input.sql ?? (primarySql.mode === "inline" ? primarySql.text : undefined),
    sqlFile:
      input.sqlFile ??
      (primarySql.mode === "file" ? primarySql.path : primarySql.path),
    parameters,
    columns: primary?.columns ?? columns,
    charts: primary?.charts ?? charts,
    grouping: primary?.grouping ?? grouping,
    validation,
    datasets,
    embeds: embeds.length ? embeds : undefined,
    layout,
    gridConfig: input.gridConfig,
  };
}

export const DEFAULT_GRID_CONFIG: ReportGridConfig = {
  density: "comfortable",
  pageSize: 50,
  pageSizeOptions: [20, 50, 100, 200],
  pinFirstColumn: false,
  showToolbar: true,
  enableQuickFilter: true,
};

export function resolveGridConfig(
  reportConfig?: ReportGridConfig,
  datasetConfig?: ReportGridConfig,
): ReportGridConfig {
  return {
    ...DEFAULT_GRID_CONFIG,
    ...reportConfig,
    ...datasetConfig,
  };
}

/** True when definition needs multi-section execution (datasets/embeds/layout) */
export function isCompositeReport(definition: ReportDefinition): boolean {
  return (
    definition.schemaVersion === 2 ||
    definition.datasets.length > 1 ||
    (definition.embeds?.length ?? 0) > 0 ||
    definition.layout.length > 1
  );
}

export function getPrimaryDataset(definition: ReportDefinition): ReportDataset {
  return (
    definition.datasets.find((d) => d.id === "main") ??
    definition.datasets.find((d) => !d.parentDatasetId) ??
    definition.datasets[0] ?? {
      id: "main",
      nameFa: definition.nameFa,
      sqlSource: definition.sqlSource,
      columns: definition.columns,
      charts: definition.charts,
      grouping: definition.grouping,
    }
  );
}
