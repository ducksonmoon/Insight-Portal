import type {
  ReportChart,
  ReportColumn,
  ReportDefinition,
  ReportSection,
} from "@/types/report";

/**
 * Key that ties a child dataset row to its parent row.
 *
 * Lives here rather than in the engine because both sides need it and they
 * must agree byte for byte: the server builds `childrenByParentKey` with it,
 * and the viewer looks rows up with it when someone clicks a master row. A
 * private copy on either side would drift silently into "clicking a row shows
 * nothing".
 */
export function makeDatasetJoinKey(
  row: Record<string, unknown>,
  fields: string[],
): string {
  return fields.map((f) => String(row[f] ?? "")).join("\u0001");
}

export type DatasetResult = {
  id: string;
  nameFa: string;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  totalCount: number;
  truncated: boolean;
  charts?: ReportChart[];
  grouping?: ReportDefinition["grouping"];
  childrenByParentKey?: Record<string, Record<string, unknown>[]>;
};

export type EmbedResult = {
  id: string;
  nameFa: string;
  reportSlug: string;
  result: ExecuteReportResult;
};

export type ExecuteReportResult = {
  rows: Record<string, unknown>[];
  totalCount: number;
  truncated: boolean;
  page: number;
  pageSize: number;
  columns: ReportColumn[];
  charts: ReportDefinition["charts"];
  grouping: ReportDefinition["grouping"];
  reportName: string;
  durationMs: number;
  schemaVersion: 1 | 2;
  datasets?: Record<string, DatasetResult>;
  embeds?: Record<string, EmbedResult>;
  layout?: ReportSection[];
};
