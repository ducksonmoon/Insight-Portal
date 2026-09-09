import { toJalaali } from "jalaali-js";

/** Gregorian → Jalali display date (e.g. "1405/6/17"), for entity-backed rules composing their own detail text now that SYS3.fn_DateToShamsiDate isn't available in-process. */
export function formatJalaliDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  const { jy, jm, jd } = toJalaali(date);
  return `${jy}/${jm}/${jd}`;
}
