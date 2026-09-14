import { jalaaliMonthLength, toGregorian, toJalaali } from "jalaali-js";

/**
 * One-click date range presets for report filters — the manual "سال/ماه/روز"
 * entry in JalaliDateInput is exact but slow, and a manager reviewing a
 * report almost always wants one of a handful of common windows ("امروز",
 * "۷ روز آینده", "این ماه") rather than typing three numbers twice. Pure
 * functions, so they're trivially testable and reusable outside the form.
 */
export type DateRangePreset = {
  id: string;
  labelFa: string;
  range: () => { start: string; end: string };
};

function fmt(jy: number, jm: number, jd: number): string {
  return `${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")}`;
}

function today(): { jy: number; jm: number; jd: number } {
  return toJalaali(new Date());
}

function addJalaliDays(
  jy: number,
  jm: number,
  jd: number,
  days: number,
): { jy: number; jm: number; jd: number } {
  const { gy, gm, gd } = toGregorian(jy, jm, jd);
  const date = new Date(gy, gm - 1, gd);
  date.setDate(date.getDate() + days);
  return toJalaali(date);
}

export function todayJalali(): string {
  const t = today();
  return fmt(t.jy, t.jm, t.jd);
}

export const DATE_RANGE_PRESETS: DateRangePreset[] = [
  {
    id: "today",
    labelFa: "امروز",
    range: () => {
      const t = today();
      const s = fmt(t.jy, t.jm, t.jd);
      return { start: s, end: s };
    },
  },
  {
    id: "next-7",
    labelFa: "۷ روز آینده",
    range: () => {
      const t = today();
      const e = addJalaliDays(t.jy, t.jm, t.jd, 7);
      return { start: fmt(t.jy, t.jm, t.jd), end: fmt(e.jy, e.jm, e.jd) };
    },
  },
  {
    id: "next-30",
    labelFa: "۳۰ روز آینده",
    range: () => {
      const t = today();
      const e = addJalaliDays(t.jy, t.jm, t.jd, 30);
      return { start: fmt(t.jy, t.jm, t.jd), end: fmt(e.jy, e.jm, e.jd) };
    },
  },
  {
    id: "last-7",
    labelFa: "۷ روز گذشته",
    range: () => {
      const t = today();
      const s = addJalaliDays(t.jy, t.jm, t.jd, -7);
      return { start: fmt(s.jy, s.jm, s.jd), end: fmt(t.jy, t.jm, t.jd) };
    },
  },
  {
    id: "last-30",
    labelFa: "۳۰ روز گذشته",
    range: () => {
      const t = today();
      const s = addJalaliDays(t.jy, t.jm, t.jd, -30);
      return { start: fmt(s.jy, s.jm, s.jd), end: fmt(t.jy, t.jm, t.jd) };
    },
  },
  {
    id: "this-month",
    labelFa: "این ماه",
    range: () => {
      const t = today();
      return {
        start: fmt(t.jy, t.jm, 1),
        end: fmt(t.jy, t.jm, jalaaliMonthLength(t.jy, t.jm)),
      };
    },
  },
  {
    id: "last-month",
    labelFa: "ماه گذشته",
    range: () => {
      const t = today();
      const jm = t.jm === 1 ? 12 : t.jm - 1;
      const jy = t.jm === 1 ? t.jy - 1 : t.jy;
      return { start: fmt(jy, jm, 1), end: fmt(jy, jm, jalaaliMonthLength(jy, jm)) };
    },
  },
];
