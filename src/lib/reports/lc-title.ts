/**
 * Parsing an LC (اعتبار اسنادی) detail-account title.
 *
 * This customer does not use Rahkaran's IPR3 foreign-trade module. Their LCs
 * live in the general ledger (`FIN3.VoucherItem`, SL `3009` for the real
 * liability, `9301` for the off-balance commitment), and the three facts that
 * make an LC row *mean* anything — order number, LC identifier, and the usance
 * term in days — exist only as free text in the level-6 detail account's
 * title. Measured over all 139 of this customer's LC detail accounts
 * (`npm run lc:probe`), the convention is strikingly consistent:
 *
 *   سفارش <order> <supplier>-<term> روزه-ش اعتبار *<identifiers>* (اعتبار <bank>)
 *   سفارش 04130282 ورق خودرو-60 روزه-ش اعتبار *1404281696948/5946904435134691* (اعتبار ملت)
 *
 * That consistency is why parsing it is worth trusting at all. The T-SQL in
 * `src/lib/reports/sql/lc.sql` nonetheless mis-reads it two ways, both
 * confirmed against the real data rather than assumed:
 *
 *   1. It advances a fixed `+ 7` past both keywords. Correct for `اعتبار `
 *      (6 letters + space), off by one for `سفارش ` (5 + space) — so the
 *      order number loses its first character unless exactly one filler
 *      character happens to sit after the space. 134 of 139 titles lose one:
 *      `04130282` is reported as `4130282`. Order numbers here are
 *      alphanumeric and leading-zero-significant (`037Z10117`, `0047018579`),
 *      so this is not cosmetic — a user filtering by the order number printed
 *      on their own paperwork matches nothing.
 *   2. It requires a digit immediately after `اعتبار ` (`PATINDEX('%اعتبار
 *      %[0-9]%')`), but every real title writes `اعتبار *…*`. The result:
 *      the LC identifier is NULL for all 139, even though 137 carry one.
 *
 * A third fragility has not yet bitten this customer but costs nothing to
 * close: `PATINDEX('%[0-9]%')` and `TRY_CAST` see only ASCII digits, so a
 * title typed with Persian digits parses to NULL, which the report turns into
 * a zero-day term — a due date equal to the invoice date, with no error
 * anywhere. Zero titles use Persian digits today.
 *
 * So: anchor on the keyword, skip whatever filler follows, take the token.
 * Never a fixed offset.
 */

/** ZWNJ, LRM, RLM, ALM, Tatweel, BOM — written as escapes because they are invisible in an editor. */
const ZERO_WIDTH_CHARS = "\u200c\u200e\u200f\u061c\u0640\ufeff";
const ZERO_WIDTH_ALL = new RegExp(`[${ZERO_WIDTH_CHARS}]`, "g");
/** Non-global: `.test()` on a global regex carries lastIndex between calls. */
export const ZERO_WIDTH_ANY = new RegExp(`[${ZERO_WIDTH_CHARS}]`);
export const NON_LATIN_DIGIT = /[۰-۹٠-٩]/;
/** Any character in the Arabic block (U+0600–U+06FF) — i.e. a Persian/Arabic letter or digit. */
const ARABIC_LETTER = /[\u0600-\u06ff]/;

const PERSIAN_ZERO = 0x06f0;
const ARABIC_ZERO = 0x0660;

const ORDER_KEYWORD = "سفارش";
const LC_KEYWORD = "اعتبار";

/** Strips invisible marks and folds Persian/Arabic-Indic digits to ASCII. */
export function normalizeTitle(text: string): string {
  return (text ?? "")
    .replace(ZERO_WIDTH_ALL, "")
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - PERSIAN_ZERO))
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - ARABIC_ZERO));
}

export interface ParsedLcTitle {
  /** Alphanumeric, leading zeros preserved — this is the FIFO settlement key. */
  orderNumber: string | null;
  /**
   * Everything the typist put between the `*…*` after `اعتبار`, verbatim.
   * Deliberately not reduced to "the LC number": real titles carry two, and
   * occasionally four, slash-separated identifiers (a bank reference and an
   * internal one, sometimes `ILC`-prefixed), and which one a finance manager
   * calls "the" LC number is their question to answer, not this parser's to
   * guess.
   */
  lcIdentifier: string | null;
  /** `lcIdentifier` split on "/" — each segment trimmed, empties dropped. */
  lcSegments: string[];
  termDays: number | null;
}

export function parseLcTitle(rawTitle: string): ParsedLcTitle {
  const title = normalizeTitle(rawTitle);

  const orderNumber = tokenAfter(title, ORDER_KEYWORD);
  const lcIdentifier = identifierAfter(title, LC_KEYWORD);

  // The number immediately before the word — not "whatever follows the first
  // hyphen in the title", which is what the report does and which any earlier
  // hyphen (the supplier name's own dash, a date, a compound code) hijacks.
  const term = /(\d+)\s*روزه/.exec(title);

  return {
    orderNumber,
    lcIdentifier,
    lcSegments: lcIdentifier ? lcIdentifier.split("/").map((part) => part.trim()).filter(Boolean) : [],
    termDays: term ? Number(term[1]) : null,
  };
}

/**
 * First alphanumeric token after `keyword`, skipping any filler (`*`, `(`,
 * spaces) in between — but only filler. If a Persian/Arabic word intervenes,
 * the order number was never typed and the next number belongs to something
 * else: two real titles read `سفارش  فولاد زرین-60 روزه-…`, where a naive
 * "first token after the keyword" returns `60`, the usance term. That would
 * pool eight unrelated voucher rows under a fictitious order `60` and, being
 * two characters long, match a dozen other LCs through the opening query's
 * `LIKE '%…%'`. Returning null instead lets the caller report a missing order
 * number, which is the truth.
 */
function tokenAfter(title: string, keyword: string): string | null {
  const at = title.indexOf(keyword);
  if (at === -1) return null;
  const rest = title.slice(at + keyword.length);
  const match = /[0-9A-Za-z]+/.exec(rest);
  if (!match) return null;
  return ARABIC_LETTER.test(rest.slice(0, match.index)) ? null : match[0];
}

/**
 * The LC identifier block after `keyword`: the contents of the first `*…*`
 * pair when present (the universal convention here), otherwise the first run
 * of identifier-ish characters. Stops before the trailing `(اعتبار <bank>)`
 * suffix either way, because that has no `*` and no leading digit.
 */
function identifierAfter(title: string, keyword: string): string | null {
  const at = title.indexOf(keyword);
  if (at === -1) return null;
  const rest = title.slice(at + keyword.length);

  const starred = /\*([^*]+)\*/.exec(rest);
  if (starred) return starred[1].trim() || null;

  const bare = /[0-9A-Za-z][0-9A-Za-z/]*/.exec(rest);
  return bare ? bare[0] : null;
}
