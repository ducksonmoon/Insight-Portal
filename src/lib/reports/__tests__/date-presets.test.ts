import { describe, expect, it } from "vitest";

import { DATE_RANGE_PRESETS, todayJalali } from "@/lib/reports/date-presets";

const JALALI_RE = /^\d{4}\/\d{2}\/\d{2}$/;

describe("todayJalali", () => {
  it("returns a well-formed jalali date string", () => {
    expect(todayJalali()).toMatch(JALALI_RE);
  });
});

describe("DATE_RANGE_PRESETS", () => {
  it("every preset returns well-formed start/end strings with start <= end", () => {
    for (const preset of DATE_RANGE_PRESETS) {
      const { start, end } = preset.range();
      expect(start).toMatch(JALALI_RE);
      expect(end).toMatch(JALALI_RE);
      expect(start <= end).toBe(true);
    }
  });

  it("'امروز' returns the same date for start and end", () => {
    const today = DATE_RANGE_PRESETS.find((p) => p.id === "today")!;
    const { start, end } = today.range();
    expect(start).toBe(end);
    expect(start).toBe(todayJalali());
  });

  it("'۷ روز آینده' starts today", () => {
    const preset = DATE_RANGE_PRESETS.find((p) => p.id === "next-7")!;
    expect(preset.range().start).toBe(todayJalali());
  });

  it("'این ماه' starts on day 1", () => {
    const preset = DATE_RANGE_PRESETS.find((p) => p.id === "this-month")!;
    expect(preset.range().start.endsWith("/01")).toBe(true);
  });

  it("preset ids are unique", () => {
    const ids = DATE_RANGE_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
