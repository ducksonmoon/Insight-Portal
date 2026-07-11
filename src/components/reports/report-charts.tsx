"use client";

import { useMemo } from "react";
import ReactECharts from "echarts-for-react";

import type { ReportChart } from "@/types/report";

const CHART_FONT = '"Vazirmatn", ui-sans-serif, sans-serif';
const MAX_CATEGORIES = 15;
const MAX_PIE_SLICES = 10;

type ReportChartsProps = {
  charts: ReportChart[];
  rows: Record<string, unknown>[];
};

function parseNumeric(value: unknown): number {
  if (typeof value === "number") return value;
  if (value == null) return 0;
  const cleaned = String(value).replace(/,/g, "").replace(/[^\d.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function truncateLabel(text: string, max = 28): string {
  const s = String(text);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function topGroupedEntries(
  rows: Record<string, unknown>[],
  xField: string,
  yField: string,
  maxItems: number,
) {
  const grouped = new Map<string, number>();
  for (const row of rows) {
    const key = String(row[xField] ?? "نامشخص").trim() || "نامشخص";
    grouped.set(key, (grouped.get(key) ?? 0) + parseNumeric(row[yField]));
  }

  const sorted = Array.from(grouped.entries()).sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, maxItems);
  const rest = sorted.slice(maxItems);

  if (rest.length) {
    const otherSum = rest.reduce((sum, [, value]) => sum + value, 0);
    if (otherSum > 0) top.push(["سایر", otherSum]);
  }

  return top;
}

function buildChartOption(
  chart: ReportChart,
  rows: Record<string, unknown>[],
) {
  const textStyle = { fontFamily: CHART_FONT, fontSize: 13 };

  if (chart.type === "pie") {
    const entries = topGroupedEntries(rows, chart.xField, chart.yField, MAX_PIE_SLICES);
    return {
      textStyle,
      title: {
        text: chart.title,
        right: 10,
        textStyle: { ...textStyle, fontSize: 14, fontWeight: 600 },
      },
      tooltip: {
        trigger: "item",
        textStyle,
        formatter: (p: { name: string; value: number; percent: number }) =>
          `${p.name}<br/>${p.value.toLocaleString("fa-IR")} (${p.percent}٪)`,
      },
      legend: {
        type: "scroll",
        orient: "vertical",
        left: 10,
        top: 40,
        textStyle: { fontFamily: CHART_FONT, fontSize: 11 },
      },
      series: [
        {
          type: "pie",
          radius: ["30%", "62%"],
          center: ["58%", "55%"],
          data: entries.map(([name, value]) => ({ name, value })),
          label: {
            fontFamily: CHART_FONT,
            formatter: (p: { name: string }) => truncateLabel(p.name, 20),
          },
        },
      ],
    };
  }

  const entries = topGroupedEntries(rows, chart.xField, chart.yField, MAX_CATEGORIES);
  const categories = entries.map(([name]) => name);
  const values = entries.map(([, value]) => value);
  const isLine = chart.type === "line";
  const useHorizontal = chart.type === "bar" && categories.length > 4;

  if (useHorizontal) {
    const chartHeight = Math.min(520, Math.max(300, categories.length * 30 + 80));
    return {
      textStyle,
      _chartHeight: chartHeight,
      title: {
        text: chart.title,
        right: 10,
        textStyle: { ...textStyle, fontSize: 14, fontWeight: 600 },
      },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        textStyle,
        formatter: (params: Array<{ name: string; value: number }>) => {
          const p = params[0];
          if (!p) return "";
          return `${p.name}<br/>${Number(p.value).toLocaleString("fa-IR")}`;
        },
      },
      grid: { left: 16, right: 24, top: 48, bottom: 16, containLabel: true },
      xAxis: {
        type: "value",
        axisLabel: {
          fontFamily: CHART_FONT,
          formatter: (v: number) => v.toLocaleString("fa-IR"),
        },
      },
      yAxis: {
        type: "category",
        data: categories,
        inverse: true,
        axisLabel: {
          fontFamily: CHART_FONT,
          fontSize: 11,
          width: 160,
          overflow: "truncate",
          formatter: (v: string) => truncateLabel(v, 32),
        },
      },
      series: [
        {
          type: isLine ? "line" : "bar",
          data: values,
          itemStyle: { color: "var(--primary)" },
          barMaxWidth: 28,
        },
      ],
    };
  }

  return {
    textStyle,
    _chartHeight: 340,
    title: {
      text: chart.title,
      right: 10,
      textStyle: { ...textStyle, fontSize: 14, fontWeight: 600 },
    },
    tooltip: {
      trigger: "axis",
      textStyle,
      formatter: (params: Array<{ name: string; value: number }>) => {
        const p = params[0];
        if (!p) return "";
        return `${p.name}<br/>${Number(p.value).toLocaleString("fa-IR")}`;
      },
    },
    grid: { left: 56, right: 20, top: 50, bottom: 72, containLabel: true },
    xAxis: {
      type: "category",
      data: categories,
      axisLabel: {
        rotate: categories.length > 6 ? 35 : 0,
        fontSize: 11,
        fontFamily: CHART_FONT,
        interval: 0,
        formatter: (v: string) => truncateLabel(v, 16),
      },
    },
    yAxis: {
      type: "value",
      axisLabel: {
        fontFamily: CHART_FONT,
        formatter: (v: number) => v.toLocaleString("fa-IR"),
      },
    },
    dataZoom:
      categories.length > 8
        ? [{ type: "slider", start: 0, end: 40, bottom: 8, height: 18 }]
        : undefined,
    series: [
      {
        type: isLine ? "line" : "bar",
        data: values,
        itemStyle: { color: "var(--primary)" },
        barMaxWidth: 48,
      },
    ],
  };
}

export function ReportCharts({ charts, rows }: ReportChartsProps) {
  const built = useMemo(
    () => charts.map((chart) => buildChartOption(chart, rows)),
    [charts, rows],
  );

  if (!charts.length || !rows.length) return null;

  return (
    <div className="grid gap-4 xl:grid-cols-1">
      {built.map((option, index) => {
        const height =
          (option as { _chartHeight?: number })._chartHeight ?? 340;
        const { _chartHeight: _, ...echartsOption } = option as Record<
          string,
          unknown
        > & { _chartHeight?: number };

        return (
          <div
            key={charts[index]?.title ?? index}
            className="overflow-hidden rounded-xl border border-[var(--border)] bg-white p-3"
          >
            <ReactECharts
              option={echartsOption}
              style={{ height, width: "100%" }}
              opts={{ renderer: "canvas" }}
            />
          </div>
        );
      })}
    </div>
  );
}
