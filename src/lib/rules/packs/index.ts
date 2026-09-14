import type { Rule } from "../types";
import { financeDailyRules } from "./finance-daily";
import { financeHealthRules } from "./finance-health";
import { financePayablesRules } from "./finance-payables";
import { lcRules } from "./lc";

/**
 * All rule packs. Adding a module means appending its rules here — the engine,
 * the API and the UI need no change.
 *
 * Planned next: انبار (LGS) — مغایرت انبار با حسابداری، کالای بدون قیمت، رسید بدون حواله.
 */
export const allRules: Rule[] = [
  ...financeHealthRules,
  ...financeDailyRules,
  ...financePayablesRules,
  ...lcRules,
];

export function getRule(id: string): Rule | undefined {
  return allRules.find((rule) => rule.id === id);
}

export { financeHealthRules, financeDailyRules, financePayablesRules, lcRules };
