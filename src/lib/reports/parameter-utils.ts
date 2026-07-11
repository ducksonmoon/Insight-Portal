import type { ReportParameter } from "@/types/report";

/** A parameter is required when explicitly marked or when nullable is false. */
export function isReportParameterRequired(param: ReportParameter): boolean {
  if (param.required === true) return true;
  if (param.nullable === false) return true;
  return false;
}

export function validateSubmittedParameters(
  parameters: ReportParameter[],
  values: Record<string, unknown>,
): { ok: true } | { ok: false; message: string } {
  for (const param of parameters) {
    if (!isReportParameterRequired(param)) continue;

    if (param.type === "jalali-date-range") {
      const startName = param.rangeStartName ?? "STARTDATE";
      const endName = param.rangeEndName ?? "ENDDATE";
      const start = values[startName] ?? values[`${param.name}__start`];
      const end = values[endName] ?? values[`${param.name}__end`];
      if (start == null || start === "") {
        return { ok: false, message: `«${param.label}» (از تاریخ) الزامی است` };
      }
      if (end == null || end === "") {
        return { ok: false, message: `«${param.label}» (تا تاریخ) الزامی است` };
      }
      continue;
    }

    const value = values[param.name];
    if (value == null || value === "") {
      return { ok: false, message: `«${param.label}» الزامی است` };
    }
  }

  return { ok: true };
}
