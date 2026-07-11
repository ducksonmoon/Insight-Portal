import {
  getPrimaryDataset,
  type ReportDefinition,
  type ReportParameter,
} from "@/types/report";
import {
  extractSqlParameters,
  resolveDatasetSqlText,
  resolveSqlText,
} from "@/lib/reports/sql-loader";

export type ValidationIssue = {
  level: "error" | "warning";
  code: string;
  message: string;
  path?: string;
};

export type ValidateReportResult = {
  ok: boolean;
  issues: ValidationIssue[];
  sqlParameters: string[];
  declaredParameters: string[];
};

function expandDeclaredParams(params: ReportParameter[]): string[] {
  const names: string[] = [];
  for (const p of params) {
    if (p.type === "jalali-date-range") {
      names.push(p.rangeStartName ?? "STARTDATE");
      names.push(p.rangeEndName ?? "ENDDATE");
    } else {
      names.push(p.name);
    }
  }
  return names;
}

export function validateReportDefinition(
  definition: ReportDefinition,
  sqlText?: string,
): ValidateReportResult {
  const issues: ValidationIssue[] = [];
  const declaredParameters = expandDeclaredParams(definition.parameters);
  let allSqlParams: string[] = [];

  if (!definition.id?.trim()) {
    issues.push({
      level: "error",
      code: "id.required",
      message: "شناسه گزارش الزامی است",
      path: "id",
    });
  }

  if (!definition.nameFa?.trim()) {
    issues.push({
      level: "error",
      code: "nameFa.required",
      message: "نام فارسی الزامی است",
      path: "nameFa",
    });
  }

  if (!definition.datasets?.length) {
    issues.push({
      level: "error",
      code: "datasets.empty",
      message: "حداقل یک دیتاست لازم است",
      path: "datasets",
    });
  }

  const datasetIds = new Set(definition.datasets.map((d) => d.id));
  const primary = getPrimaryDataset(definition);

  for (const dataset of definition.datasets) {
    let datasetSql = "";
    try {
      datasetSql =
        dataset.id === primary.id && sqlText
          ? sqlText
          : resolveDatasetSqlText(definition, dataset);
    } catch {
      datasetSql = "";
    }

    if (!datasetSql?.trim()) {
      issues.push({
        level: "error",
        code: "sql.empty",
        message: `متن SQL دیتاست «${dataset.nameFa || dataset.id}» خالی است`,
        path: `datasets.${dataset.id}`,
      });
    } else {
      const params = extractSqlParameters(datasetSql);
      allSqlParams = [...new Set([...allSqlParams, ...params])];
      // Missing declared params checked per-dataset (required binds)
      const declaredSet = new Set(
        declaredParameters.map((s) => s.toLowerCase()),
      );
      for (const name of params) {
        if (!declaredSet.has(name.toLowerCase())) {
          issues.push({
            level: "error",
            code: "param.missing",
            message: `پارامتر SQL @${name} در تعریف گزارش وجود ندارد (دیتاست ${dataset.id})`,
            path: `datasets.${dataset.id}.parameters.${name}`,
          });
        }
      }
    }

    if (!dataset.columns.length) {
      issues.push({
        level: "warning",
        code: "columns.empty",
        message: `دیتاست «${dataset.nameFa || dataset.id}» ستونی ندارد`,
        path: `datasets.${dataset.id}.columns`,
      });
    }

    if (dataset.parentDatasetId && !datasetIds.has(dataset.parentDatasetId)) {
      issues.push({
        level: "error",
        code: "dataset.parent",
        message: `دیتاست والد «${dataset.parentDatasetId}» یافت نشد`,
        path: `datasets.${dataset.id}.parentDatasetId`,
      });
    }

    if (
      dataset.parentDatasetId &&
      (!dataset.parentKeyFields?.length || !dataset.childKeyFields?.length)
    ) {
      issues.push({
        level: "warning",
        code: "dataset.keys",
        message: `دیتاست «${dataset.id}» والد دارد ولی کلید join تعریف نشده`,
        path: `datasets.${dataset.id}`,
      });
    }

    for (const chart of dataset.charts ?? []) {
      if (
        dataset.columns.length &&
        !dataset.columns.some((c) => c.field === chart.xField)
      ) {
        issues.push({
          level: "warning",
          code: "chart.xField",
          message: `فیلد نمودار «${chart.xField}» در ستون‌های ${dataset.id} نیست`,
          path: `datasets.${dataset.id}.charts`,
        });
      }
    }
  }

  // Unused declared params: only if not used in ANY dataset
  const allSqlSet = new Set(allSqlParams.map((s) => s.toLowerCase()));
  for (const name of declaredParameters) {
    if (!allSqlSet.has(name.toLowerCase())) {
      issues.push({
        level: "warning",
        code: "param.unused",
        message: `پارامتر «${name}» در تعریف هست ولی در هیچ SQL دیده نشد`,
        path: `parameters.${name}`,
      });
    }
  }

  const embedIds = new Set((definition.embeds ?? []).map((e) => e.id));
  for (const embed of definition.embeds ?? []) {
    if (!embed.reportSlug?.trim()) {
      issues.push({
        level: "error",
        code: "embed.slug",
        message: `شناسه گزارش embed «${embed.id}» خالی است`,
        path: `embeds.${embed.id}`,
      });
    }
    if (embed.reportSlug === definition.id) {
      issues.push({
        level: "error",
        code: "embed.self",
        message: `نمی‌توان گزارش را داخل خودش embed کرد`,
        path: `embeds.${embed.id}`,
      });
    }
  }

  for (const section of definition.layout ?? []) {
    if (section.type === "dataset" && !datasetIds.has(section.datasetId)) {
      issues.push({
        level: "error",
        code: "layout.dataset",
        message: `بخش layout به دیتاست ناموجود «${section.datasetId}» اشاره دارد`,
        path: "layout",
      });
    }
    if (section.type === "embed" && !embedIds.has(section.embedId)) {
      issues.push({
        level: "error",
        code: "layout.embed",
        message: `بخش layout به embed ناموجود «${section.embedId}» اشاره دارد`,
        path: "layout",
      });
    }
    if (section.type === "chart") {
      const ds = definition.datasets.find((d) => d.id === section.datasetId);
      if (!ds) {
        issues.push({
          level: "error",
          code: "layout.chart",
          message: `نمودار layout به دیتاست ناموجود اشاره دارد`,
          path: "layout",
        });
      } else if (!(ds.charts ?? [])[section.chartIndex]) {
        issues.push({
          level: "warning",
          code: "layout.chartIndex",
          message: `ایندکس نمودار ${section.chartIndex} در دیتاست ${section.datasetId} نیست`,
          path: "layout",
        });
      }
    }
  }

  const paramNames = new Set<string>();
  for (const p of definition.parameters) {
    if (paramNames.has(p.name)) {
      issues.push({
        level: "error",
        code: "param.duplicate",
        message: `پارامتر تکراری: ${p.name}`,
        path: `parameters.${p.name}`,
      });
    }
    paramNames.add(p.name);

    if (p.type === "lookup" && !p.lookupSql && !p.lookupCatalogSlug) {
      issues.push({
        level: "error",
        code: "lookup.missing",
        message: `پارامتر lookup «${p.name}» نیاز به lookupSql یا lookupCatalogSlug دارد`,
        path: `parameters.${p.name}`,
      });
    }

    if (p.type === "select" && (!p.options || p.options.length === 0)) {
      issues.push({
        level: "warning",
        code: "select.empty",
        message: `پارامتر select «${p.name}» گزینه‌ای ندارد`,
        path: `parameters.${p.name}`,
      });
    }
  }

  if (!definition.columns.length && definition.datasets.every((d) => !d.columns.length)) {
    issues.push({
      level: "warning",
      code: "columns.empty",
      message: "هیچ ستونی تعریف نشده — از introspect استفاده کنید",
      path: "columns",
    });
  }

  const ok = !issues.some((i) => i.level === "error");
  return {
    ok,
    issues,
    sqlParameters: allSqlParams.length
      ? allSqlParams
      : sqlText
        ? extractSqlParameters(sqlText)
        : (() => {
            try {
              return extractSqlParameters(resolveSqlText(definition));
            } catch {
              return [];
            }
          })(),
    declaredParameters,
  };
}

export function suggestColumnsFromRows(
  rows: Record<string, unknown>[],
): ReportDefinition["columns"] {
  if (!rows.length) return [];
  const sample = rows[0];
  return Object.keys(sample).map((field) => {
    const value = sample[field];
    let type: "string" | "number" | "date" | "boolean" = "string";
    if (typeof value === "number") type = "number";
    else if (typeof value === "boolean") type = "boolean";
    else if (value instanceof Date) type = "date";
    return {
      field,
      header: field,
      type,
      width: Math.min(300, Math.max(100, field.length * 12)),
    };
  });
}
