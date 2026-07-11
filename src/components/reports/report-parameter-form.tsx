"use client";

import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Loader2 } from "lucide-react";

import { JalaliDateInput } from "@/components/reports/jalali-date-input";
import { Button } from "@/components/ui/button";
import {
  isReportParameterRequired,
  validateSubmittedParameters,
} from "@/lib/reports/parameter-utils";
import type { ReportParameter } from "@/types/report";

type ReportParameterFormProps = {
  parameters: ReportParameter[];
  reportId: string;
  onSubmit: (values: Record<string, unknown>) => Promise<void> | void;
  isLoading?: boolean;
  initialValues?: Record<string, unknown>;
  /** Skip fetching lookups (e.g. draft studio preview) */
  skipLookups?: boolean;
  submitLabel?: string;
};

const fieldClass =
  "h-10 rounded-lg border border-[var(--border)] bg-white px-3 text-[var(--foreground)]";

const fieldErrorClass =
  "border-[var(--danger)] ring-1 ring-[var(--danger)]/30";

export function ReportParameterForm({
  parameters,
  reportId,
  onSubmit,
  isLoading,
  initialValues,
  skipLookups,
  submitLabel = "اجرای گزارش",
}: ReportParameterFormProps) {
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
    setError,
    clearErrors,
  } = useForm<Record<string, string>>();
  const [lookups, setLookups] = useState<
    Record<string, Array<{ value: string; label: string }>>
  >({});
  const [loadingLookups, setLoadingLookups] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const hasRequired = parameters.some(isReportParameterRequired);

  useEffect(() => {
    if (!initialValues) return;
    const formValues: Record<string, string> = {};
    for (const param of parameters) {
      if (param.type === "jalali-date-range") {
        const startName = param.rangeStartName ?? "STARTDATE";
        const endName = param.rangeEndName ?? "ENDDATE";
        const range = initialValues[param.name] as
          | { start?: unknown; end?: unknown }
          | undefined;
        formValues[`${param.name}__start`] = String(
          initialValues[startName] ?? range?.start ?? "",
        );
        formValues[`${param.name}__end`] = String(
          initialValues[endName] ?? range?.end ?? "",
        );
        continue;
      }
      const v = initialValues[param.name];
      formValues[param.name] = v == null ? "" : String(v);
    }
    reset(formValues);
  }, [initialValues, parameters, reset]);

  useEffect(() => {
    const hasLookup = parameters.some((p) => p.type === "lookup");
    if (!hasLookup || skipLookups) return;

    let cancelled = false;
    setLoadingLookups(true);

    fetch(`/api/reports/${reportId}/lookups`)
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setLookups(data.lookups ?? {});
      })
      .catch(() => {
        /* lookups optional when DB offline */
      })
      .finally(() => {
        if (!cancelled) setLoadingLookups(false);
      });

    return () => {
      cancelled = true;
    };
  }, [parameters, reportId, skipLookups]);

  function requiredRule(param: ReportParameter) {
    return isReportParameterRequired(param)
      ? (`«${param.label}» الزامی است` as const)
      : false;
  }

  return (
    <form
      className="space-y-4"
      onSubmit={handleSubmit(async (values) => {
        setSubmitError(null);
        clearErrors();

        const cleaned: Record<string, unknown> = {};
        for (const param of parameters) {
          if (param.type === "jalali-date-range") {
            const startKey = `${param.name}__start`;
            const endKey = `${param.name}__end`;
            const startName = param.rangeStartName ?? "STARTDATE";
            const endName = param.rangeEndName ?? "ENDDATE";
            cleaned[startName] = values[startKey] === "" ? null : values[startKey];
            cleaned[endName] = values[endKey] === "" ? null : values[endKey];
            cleaned[param.name] = {
              start: cleaned[startName],
              end: cleaned[endName],
            };
            continue;
          }
          const value = values[param.name];
          cleaned[param.name] = value === "" || value === undefined ? null : value;
        }

        const validation = validateSubmittedParameters(parameters, cleaned);
        if (!validation.ok) {
          setSubmitError(validation.message);
          return;
        }

        await onSubmit(cleaned);
      })}
    >
      {hasRequired ? (
        <p className="text-xs text-[var(--muted)]">
          فیلدهای دارای <span className="text-[var(--danger)]">*</span> الزامی هستند.
          فیلترهای اختیاری خالی یعنی «همه».
        </p>
      ) : (
        <p className="text-xs text-[var(--muted)]">
          همه فیلترها اختیاری‌اند — خالی گذاشتن یعنی «همه».
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {parameters.map((param) => {
          const required = isReportParameterRequired(param);

          return param.type === "jalali-date-range" ? (
            <div
              key={param.name}
              className="flex flex-col gap-1.5 text-sm md:col-span-2"
            >
              <span className="font-medium text-[var(--foreground)]">
                {param.label}
                {required ? <span className="text-[var(--danger)]"> *</span> : null}
              </span>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="mb-1 text-[11px] text-[var(--muted)]">
                    از تاریخ
                    {required ? <span className="text-[var(--danger)]"> *</span> : null}
                  </p>
                  <Controller
                    name={`${param.name}__start`}
                    control={control}
                    defaultValue=""
                    rules={{ required: requiredRule(param) }}
                    render={({ field }) => (
                      <JalaliDateInput
                        name={field.name}
                        value={field.value}
                        onChange={field.onChange}
                        disabled={isLoading}
                        className={
                          errors[`${param.name}__start`] ? fieldErrorClass : undefined
                        }
                      />
                    )}
                  />
                </div>
                <div>
                  <p className="mb-1 text-[11px] text-[var(--muted)]">
                    تا تاریخ
                    {required ? <span className="text-[var(--danger)]"> *</span> : null}
                  </p>
                  <Controller
                    name={`${param.name}__end`}
                    control={control}
                    defaultValue=""
                    rules={{ required: requiredRule(param) }}
                    render={({ field }) => (
                      <JalaliDateInput
                        name={field.name}
                        value={field.value}
                        onChange={field.onChange}
                        disabled={isLoading}
                        className={
                          errors[`${param.name}__end`] ? fieldErrorClass : undefined
                        }
                      />
                    )}
                  />
                </div>
              </div>
            </div>
          ) : (
            <label key={param.name} className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-[var(--foreground)]">
                {param.label}
                {required ? <span className="text-[var(--danger)]"> *</span> : null}
              </span>

              {param.type === "select" || param.type === "lookup" ? (
                <select
                  className={`${fieldClass} ${errors[param.name] ? fieldErrorClass : ""}`}
                  disabled={param.type === "lookup" && loadingLookups}
                  {...register(param.name, { required: requiredRule(param) })}
                >
                  {!required ? <option value="">همه</option> : <option value="">انتخاب کنید</option>}
                  {(param.type === "select"
                    ? param.options ?? []
                    : lookups[param.name] ?? []
                  ).map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : param.type === "boolean" ? (
                <select
                  className={`${fieldClass} ${errors[param.name] ? fieldErrorClass : ""}`}
                  {...register(param.name, { required: requiredRule(param) })}
                >
                  {!required ? <option value="">—</option> : null}
                  <option value="true">بله</option>
                  <option value="false">خیر</option>
                </select>
              ) : param.type === "jalali-date" ? (
                <Controller
                  name={param.name}
                  control={control}
                  defaultValue=""
                  rules={{ required: requiredRule(param) }}
                  render={({ field }) => (
                    <JalaliDateInput
                      name={field.name}
                      value={field.value}
                      onChange={field.onChange}
                      disabled={isLoading}
                      className={errors[param.name] ? fieldErrorClass : undefined}
                    />
                  )}
                />
              ) : (
                <input
                  type={param.type === "number" ? "number" : "text"}
                  className={`${fieldClass} ${errors[param.name] ? fieldErrorClass : ""}`}
                  {...register(param.name, { required: requiredRule(param) })}
                />
              )}

              {errors[param.name] ? (
                <span className="text-xs text-[var(--danger)]">
                  {String(errors[param.name]?.message ?? "")}
                </span>
              ) : null}
            </label>
          );
        })}
      </div>

      {submitError ? <p className="alert alert-danger">{submitError}</p> : null}

      <div className="flex items-center gap-2 border-t border-[var(--border)] pt-4">
        <Button type="submit" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              در حال اجرا...
            </>
          ) : (
            submitLabel
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isLoading}
          onClick={() => {
            reset();
            setSubmitError(null);
            clearErrors();
          }}
        >
          پاک کردن فیلترها
        </Button>
      </div>
    </form>
  );
}
