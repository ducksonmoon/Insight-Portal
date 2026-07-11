import type {
  ReportChart,
  ReportColumn,
  ReportDefinition,
  ReportSection,
} from "@/types/report";

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
