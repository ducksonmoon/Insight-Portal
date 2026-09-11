import { describe, expect, it } from "vitest";
import { parseLcTitle } from "../lc-title";

/**
 * Every title below except the two marked "synthetic" is a verbatim detail-
 * account title from شرکت فولاد بهمن's Rahkaran database, collected by
 * `npm run lc:probe`. They are here rather than a tidied-up approximation
 * because the whole point of this parser is that it survives what people
 * actually typed.
 */
describe("parseLcTitle", () => {
  it("keeps the order number's leading zero", () => {
    // The shipped T-SQL's fixed `+ 7` returns "4130282" here — the single
    // most common defect in this data (134 of 139 titles).
    expect(parseLcTitle("سفارش 04130282 ورق خودرو-60 روزه-ش اعتبار *1404281696948/5946904435134691* (اعتبار ملت)")).toEqual({
      orderNumber: "04130282",
      lcIdentifier: "1404281696948/5946904435134691",
      lcSegments: ["1404281696948", "5946904435134691"],
      termDays: 60,
    });
  });

  it("keeps letters inside an order number", () => {
    // "037Z10117": a digits-only parse truncates this to "037" and silently
    // merges four different orders into one settlement pool.
    expect(parseLcTitle("سفارش 037Z10117 فولاد مبارکه-90 روزه-ش اعتبار *1403391653266/5946903489203618* (اعتبار ملت)").orderNumber).toBe(
      "037Z10117",
    );
  });

  it("still parses when the typist left two spaces (the case the report gets right today)", () => {
    expect(parseLcTitle("سفارش  0047017827 فولاد مبارکه-60 روزه-ش اعتبار *0020304461056364* (اعتبار رفاه)").orderNumber).toBe(
      "0047017827",
    );
  });

  it("reads the LC identifier the report always misses", () => {
    // The report needs a digit straight after "اعتبار "; every real title
    // writes "اعتبار *…*", so its شماره اعتبار column is empty for all 139.
    const parsed = parseLcTitle("سفارش 03810283 ورق خودرو-60 روزه-ش اعتبار *0011404495541351* (اعتبار صادرات)");
    expect(parsed.lcIdentifier).toBe("0011404495541351");
    expect(parsed.lcSegments).toEqual(["0011404495541351"]);
  });

  it("keeps an ILC-prefixed identifier whole rather than reducing it to a number", () => {
    const parsed = parseLcTitle(
      "سفارش 037Z10073 فولاد مبارکه-90 روزه-ش اعتبار *ILC279455144454588/279203411114673* (اعتبار بانک شهر)",
    );
    expect(parsed.lcIdentifier).toBe("ILC279455144454588/279203411114673");
    expect(parsed.lcSegments).toEqual(["ILC279455144454588", "279203411114673"]);
  });

  it("keeps all four segments when a title carries four", () => {
    const parsed = parseLcTitle(
      "سفارش 047012237 فولاد مبارکه-90 روزه-ش اعتبار *ILC279455144457076/279455144455773/76839374/279204427047292* (اعتبار بانک شهر)",
    );
    expect(parsed.lcSegments).toHaveLength(4);
    expect(parsed.orderNumber).toBe("047012237");
  });

  it("reads the term from the number beside روزه, not from the first hyphen", () => {
    // "چهار محال بختیاری -60 روزه": the supplier name's own dash comes first.
    expect(parseLcTitle("سفارش 03810341 ورق خودرو چهار محال بختیاری -60 روزه-ش اعتبار *0011403415485144*(اعتبار صادرات)").termDays).toBe(
      60,
    );
    expect(parseLcTitle("سفارش 047017645 فولاد مبارکه -60روزه-ش اعتبار *ILC20020304424991963* (اعتبار بانک رفاه)").termDays).toBe(60);
  });

  it("returns a null term for the outlier title that has no روزه at all", () => {
    const parsed = parseLcTitle(
      "سفارش 0570434 شرکت ورق خودرو چهار محال -اعتبار*1501105447522942* 5121DLC/1501/02222 -بانک دی",
    );
    expect(parsed.orderNumber).toBe("0570434");
    expect(parsed.termDays).toBeNull();
    // A null term must stay null: the report's ISNULL(...,0) turns it into a
    // due date equal to the invoice date, which reads as instantly overdue.
  });

  it("refuses to invent an order number when the clerk skipped it", () => {
    // Two real titles omit the order number. "First number after the keyword"
    // would return 60 — the usance term — pooling eight unrelated voucher
    // rows under a fictitious order and matching a dozen other LCs through
    // the opening query's LIKE. Null is the honest answer.
    const parsed = parseLcTitle("سفارش  فولاد زرین-60 روزه-ش اعتبار *1403528213161/5946903426722161* (اعتبار ملت)");
    expect(parsed.orderNumber).toBeNull();
    expect(parsed.termDays).toBe(60);
    expect(parsed.lcIdentifier).toBe("1403528213161/5946903426722161");
  });

  it("folds Persian and Arabic-Indic digits (synthetic — no such title exists here yet)", () => {
    expect(parseLcTitle("سفارش ۰۴۵۲۱ فولاد-۹۰ روزه-ش اعتبار *١٢٣٤٥٦*")).toEqual({
      orderNumber: "04521",
      lcIdentifier: "123456",
      lcSegments: ["123456"],
      termDays: 90,
    });
  });

  it("returns nulls rather than guessing (synthetic)", () => {
    expect(parseLcTitle("پیش پرداخت بابت گشایش")).toEqual({
      orderNumber: null,
      lcIdentifier: null,
      lcSegments: [],
      termDays: null,
    });
    expect(parseLcTitle(undefined as unknown as string).termDays).toBeNull();
  });
});
