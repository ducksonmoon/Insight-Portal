"use client";

import { useEffect, useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";

type DashboardChartWidgetProps = {
  reportSlug: string;
  chartIndex?: number;
};

type ChartDef = {
  type: string;
  title: string;
  xField: string;
  yField: string;
};

export function DashboardChartWidget({
  reportSlug,
  chartIndex = 0,
}: DashboardChartWidgetProps) {
  const [chart, setChart] = useState<ChartDef | null>(null);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch("/api/dashboard/chart-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reportSlug, chartIndex, parameters: {} }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "خطا");
        if (!cancelled) {
          setChart(data.chart);
          setRows(data.rows ?? []);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "خطا");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reportSlug, chartIndex]);

  const option = useMemo(() => {
    if (!chart || !rows.length) return null;

    const labels = rows.map((r) => String(r[chart.xField] ?? ""));
    const values = rows.map((r) => Number(r[chart.yField] ?? 0));

    if (chart.type === "pie") {
      return {
        tooltip: { trigger: "item" },
        series: [
          {
            type: "pie",
            radius: ["35%", "65%"],
            data: labels.slice(0, 12).map((name, i) => ({
              name,
              value: values[i] ?? 0,
            })),
          },
        ],
      };
    }

    return {
      tooltip: { trigger: "axis" },
      grid: { left: 48, right: 16, top: 24, bottom: 48 },
      xAxis: {
        type: chart.type === "bar" ? "category" : "category",
        data: labels.slice(0, 15),
        axisLabel: { rotate: 35, fontSize: 10 },
      },
      yAxis: { type: "value" },
      series: [
        {
          type: chart.type === "line" ? "line" : "bar",
          data: values.slice(0, 15),
          itemStyle: { color: "var(--primary)" },
        },
      ],
    };
  }, [chart, rows]);

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-[var(--muted)]">
        در حال بارگذاری نمودار…
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-[var(--danger)]">
        {error}
      </p>
    );
  }

  if (!option) {
    return (
      <p className="text-sm text-[var(--muted)]">داده‌ای برای نمودار نیست</p>
    );
  }

  return (
    <ReactECharts
      option={option}
      style={{ height: 220, width: "100%" }}
      opts={{ renderer: "canvas" }}
    />
  );
}
