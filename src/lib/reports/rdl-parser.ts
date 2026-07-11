import { XMLParser } from "fast-xml-parser";

export type ParsedRdlParameter = {
  name: string;
  dataType: string;
  prompt?: string;
  nullable?: boolean;
  allowBlank?: boolean;
};

export type ParsedRdlField = {
  name: string;
  dataField?: string;
  type?: string;
};

export type ParsedRdlDataset = {
  name: string;
  sql: string;
  fields: ParsedRdlField[];
};

export type ParsedRdlLayout = {
  tablixCount: number;
  textboxCount: number;
  headerLabels: string[];
};

export type ParsedRdl = {
  name: string;
  dataSources: string[];
  datasets: ParsedRdlDataset[];
  parameters: ParsedRdlParameter[];
  layout: ParsedRdlLayout;
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  trimValues: true,
  isArray: (name) =>
    [
      "DataSource",
      "DataSet",
      "Field",
      "ReportParameter",
      "QueryParameter",
      "Tablix",
      "Textbox",
      "ReportSection",
    ].includes(name),
});

function textVal(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (typeof node === "object" && node !== null && "#text" in node) {
    return String((node as { "#text": unknown })["#text"] ?? "");
  }
  return "";
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractHeaderLabels(report: Record<string, unknown>): string[] {
  const labels: string[] = [];
  const reportSections = report.ReportSections as Record<string, unknown> | undefined;
  const sections = reportSections?.ReportSection ?? [];
  const sectionList = Array.isArray(sections) ? sections : [sections];

  for (const section of sectionList) {
    if (!section || typeof section !== "object") continue;
    const body = (section as Record<string, unknown>).Body;
    if (!body || typeof body !== "object") continue;

    const reportItems = (body as Record<string, unknown>).ReportItems;
    if (!reportItems || typeof reportItems !== "object") continue;

    const tablixes = (reportItems as Record<string, unknown>).Tablix ?? [];
    const tabList = Array.isArray(tablixes) ? tablixes : [tablixes];

    for (const tab of tabList) {
      if (!tab || typeof tab !== "object") continue;
      const tablixBody = (tab as Record<string, unknown>).TablixBody as
        | Record<string, unknown>
        | undefined;
      const tablixRows = tablixBody?.TablixRows as Record<string, unknown> | undefined;
      const rows = tablixRows?.TablixRow;
      const rowList = Array.isArray(rows) ? rows : rows ? [rows] : [];
      const headerRow = rowList[0];
      if (!headerRow || typeof headerRow !== "object") continue;

      const tablixCells = (headerRow as Record<string, unknown>).TablixCells as
        | Record<string, unknown>
        | undefined;
      const cells = tablixCells?.TablixCell;
      const cellList = Array.isArray(cells) ? cells : cells ? [cells] : [];

      for (const cell of cellList) {
        if (!cell || typeof cell !== "object") continue;
        const cellContents = (cell as Record<string, unknown>).CellContents as
          | Record<string, unknown>
          | undefined;
        const tb = cellContents?.Textbox;
        if (!tb || typeof tb !== "object") continue;
        const val = textVal((tb as Record<string, unknown>).Value);
        const cleaned = decodeXmlEntities(val).trim();
        if (cleaned && !cleaned.startsWith("=")) {
          labels.push(cleaned);
        }
      }
      if (labels.length) return labels;
    }
  }

  return labels;
}

export function parseRdlXml(xml: string, fallbackName?: string): ParsedRdl {
  const doc = parser.parse(xml) as { Report?: Record<string, unknown> };
  const report = doc.Report;
  if (!report) throw new Error("فایل RDL معتبر نیست (تگ Report یافت نشد)");

  const name =
    fallbackName?.replace(/\.rdl$/i, "") ||
    textVal(report["@_Name"]) ||
    "گزارش RDL";

  const dataSourcesRaw = (report.DataSources as Record<string, unknown> | undefined)
    ?.DataSource ?? [];
  const dataSources = (Array.isArray(dataSourcesRaw)
    ? dataSourcesRaw
    : [dataSourcesRaw]
  )
    .map((ds) =>
      ds && typeof ds === "object"
        ? textVal((ds as Record<string, unknown>)["@_Name"])
        : "",
    )
    .filter(Boolean);

  const datasetsRaw = (report.DataSets as Record<string, unknown> | undefined)
    ?.DataSet ?? [];
  const datasets: ParsedRdlDataset[] = (Array.isArray(datasetsRaw)
    ? datasetsRaw
    : [datasetsRaw]
  )
    .filter(Boolean)
    .map((ds) => {
      const obj = ds as Record<string, unknown>;
      const dsName = textVal(obj["@_Name"]) || "DataSet1";
      const query = obj.Query as Record<string, unknown> | undefined;
      const sql = decodeXmlEntities(textVal(query?.CommandText));

      const fieldsContainer = obj.Fields as Record<string, unknown> | undefined;
      const fieldsRaw = fieldsContainer?.Field ?? [];
      const fields: ParsedRdlField[] = (Array.isArray(fieldsRaw)
        ? fieldsRaw
        : [fieldsRaw]
      )
        .filter(Boolean)
        .map((f) => {
          const fo = f as Record<string, unknown>;
          return {
            name: textVal(fo["@_Name"]),
            dataField: textVal(fo.DataField) || undefined,
            type: textVal(fo.Type) || undefined,
          };
        })
        .filter((f) => f.name);

      return { name: dsName, sql, fields };
    });

  const paramsRaw = (report.ReportParameters as Record<string, unknown> | undefined)
    ?.ReportParameter ?? [];
  const parameters: ParsedRdlParameter[] = (Array.isArray(paramsRaw)
    ? paramsRaw
    : [paramsRaw]
  )
    .filter(Boolean)
    .map((p) => {
      const po = p as Record<string, unknown>;
      return {
        name: textVal(po["@_Name"]),
        dataType: textVal(po.DataType) || "String",
        prompt: textVal(po.Prompt) || undefined,
        nullable: textVal(po.Nullable).toLowerCase() === "true",
        allowBlank: textVal(po.AllowBlank).toLowerCase() === "true",
      };
    })
    .filter((p) => p.name);

  const tablixRaw = (report.ReportSections as Record<string, unknown> | undefined)
    ?.ReportSection ?? [];
  let tablixCount = 0;
  let textboxCount = 0;

  const sectionList = Array.isArray(tablixRaw) ? tablixRaw : [tablixRaw];
  for (const section of sectionList) {
    if (!section || typeof section !== "object") continue;
    const bodyObj = (section as Record<string, unknown>).Body as
      | Record<string, unknown>
      | undefined;
    const body = bodyObj?.ReportItems;
    if (!body || typeof body !== "object") continue;
    const tabs = (body as Record<string, unknown>).Tablix ?? [];
    tablixCount += (Array.isArray(tabs) ? tabs : [tabs]).filter(Boolean).length;
    const tbs = (body as Record<string, unknown>).Textbox ?? [];
    textboxCount += (Array.isArray(tbs) ? tbs : [tbs]).filter(Boolean).length;
  }

  const headerLabels = extractHeaderLabels(report);

  return {
    name,
    dataSources,
    datasets,
    parameters,
    layout: {
      tablixCount,
      textboxCount,
      headerLabels,
    },
  };
}

/** Map RDL parameter to Insight Portal parameter type */
export function rdlParamToInsight(param: ParsedRdlParameter) {
  const prompt = param.prompt ?? param.name;
  const lower = `${param.name} ${prompt}`.toLowerCase();

  if (param.dataType === "DateTime" || lower.includes("تاریخ") || lower.includes("date")) {
    return {
      name: param.name,
      label: prompt,
      type: "jalali-date" as const,
      nullable: param.nullable ?? param.allowBlank ?? true,
    };
  }

  if (param.dataType === "Integer" || param.dataType === "Float") {
    return {
      name: param.name,
      label: prompt,
      type: "number" as const,
      nullable: param.nullable ?? true,
    };
  }

  if (param.dataType === "Boolean") {
    return {
      name: param.name,
      label: prompt,
      type: "boolean" as const,
      nullable: true,
    };
  }

  return {
    name: param.name,
    label: prompt,
    type: "text" as const,
    nullable: param.nullable ?? param.allowBlank ?? true,
  };
}

export function mapRdlDataSource(sources: string[]): string {
  const normalized: Record<string, string> = {
    rahkaran: "rahkaran",
    rahkarandb: "rahkaran",
    erp: "rahkaran",
    attendance: "attendance",
  };
  for (const src of sources) {
    const key = src.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    if (normalized[key]) return normalized[key];
    if (key.includes("rahkaran")) return "rahkaran";
  }
  return "rahkaran";
}

function inferFieldType(field: ParsedRdlField): "string" | "number" | "date" | "boolean" {
  const t = (field.type ?? "").toLowerCase();
  if (t.includes("int") || t.includes("float") || t.includes("decimal")) return "number";
  if (t.includes("date") || t.includes("time")) return "date";
  if (t.includes("bool")) return "boolean";
  return "string";
}

function headerForField(field: ParsedRdlField, headerLabels: string[]): string {
  const name = field.name;
  for (const label of headerLabels) {
    const clean = decodeXmlEntities(label).trim();
    if (!clean || clean.startsWith("=")) continue;
    if (
      clean === name ||
      clean.includes(name) ||
      clean.toLowerCase().includes(`fields!${name.toLowerCase()}`)
    ) {
      return clean.replace(/^=Fields![^.]+\.Value$/i, name);
    }
  }
  return name;
}

function columnsForDataset(
  dataset: ParsedRdlDataset,
  headerLabels: string[],
): Array<{
  field: string;
  header: string;
  type: "string" | "number" | "date" | "boolean";
  width: number;
}> {
  return dataset.fields.map((f) => ({
    field: f.name,
    header: headerForField(f, headerLabels),
    type: inferFieldType(f),
    width: 120,
  }));
}

export function rdlNeedsManualReview(parsed: ParsedRdl): boolean {
  return (
    parsed.datasets.length > 1 ||
    parsed.datasets.some((d) => !d.sql) ||
    parsed.layout.tablixCount > 2
  );
}

export function rdlToReportDefinition(
  parsed: ParsedRdl,
  options: { slug: string; moduleId: string; nameFa?: string },
) {
  const withSql = parsed.datasets.filter((d) => d.sql?.trim());
  if (!withSql.length) {
    throw new Error("SQL در RDL یافت نشد");
  }

  const parameters = parsed.parameters.map(rdlParamToInsight);
  const dataSourceId = mapRdlDataSource(parsed.dataSources);
  const multi = withSql.length > 1;

  const datasets = withSql.map((ds, idx) => ({
    id: idx === 0 ? "main" : slugifyDatasetId(ds.name, idx),
    nameFa: ds.name || (idx === 0 ? "اصلی" : `دیتاست ${idx + 1}`),
    sqlSource: { mode: "inline" as const, text: ds.sql },
    columns: columnsForDataset(ds, parsed.layout.headerLabels),
    charts: [],
    ...(idx > 0
      ? {
          parentDatasetId: "main",
          parentKeyFields: [],
          childKeyFields: [],
        }
      : {}),
  }));

  const primary = datasets[0]!;

  return {
    schemaVersion: multi ? (2 as const) : (1 as const),
    id: options.slug,
    nameFa: options.nameFa ?? parsed.name,
    moduleId: options.moduleId,
    dataSourceId,
    sqlSource: primary.sqlSource,
    sql: primary.sqlSource.text,
    parameters,
    columns: primary.columns,
    charts: [],
    datasets,
    layout: datasets.map((d) => ({
      type: "dataset" as const,
      datasetId: d.id,
      title: d.nameFa,
    })),
    validation: { maxRows: 10000, queryTimeoutSec: 60 },
    gridConfig: {
      density: "compact" as const,
      pinFirstColumn: true,
    },
  };
}

function slugifyDatasetId(name: string, idx: number): string {
  const s = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s.length >= 2 ? s.slice(0, 40) : `dataset-${idx}`;
}

export function slugifyFromRdlName(name: string): string {
  const latin = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (latin.length >= 3) return latin.slice(0, 60);
  return `rdl-${Date.now().toString(36)}`;
}
