# Letters of Credit in Insight Portal — findings and a plan

Companion to
[management-intelligence-platform.md](./management-intelligence-platform.md),
whose §14 deferred an `LC` Business Entity behind two questions it refused to
guess at:

> Is the unfiltered full-scan fast enough to sync periodically, or does the
> cursor loop make it report-only? Is title-text parsing reliable enough to
> trust in an automated rule, or does it need a human's eyes on each match?

Both are now answered with measurements against شرکت فولاد بهمن's live
database, not estimates. `npm run lc:probe` reproduces every number below.

**Short answers:** the full scan takes ~10 seconds over 2,304 voucher rows —
comfortably syncable on a schedule, not comfortable as a page view. The title
convention is far more consistent than feared (139 detail accounts, one
format, zero Persian digits, zero invisible characters) — so parsing it is
trustworthy. The parser that ships today is not.

---

## 0. The finding that matters most

The LC report already exists in the product — `src/lib/reports/sql/lc.sql`,
registered as `lc-report` with six parameters, charts and grouping. What's
wrong is not that we lack a place for LCs. It's that the copy we ship drifted
from the customer's own current RDL, and both versions mis-read the data they
depend on.

> §3's Layer 1 is now fixed; §§0–2 describe what the report did before that,
> because every number in the plan comes from it.

Run against the same database on the same day, all parameters empty:

| | shipped `lc.sql` | customer's current RDL |
| --- | ---: | ---: |
| تسویه شده | 43 | 1,078 |
| معوق | 859 | 135 |
| مازاد پرداخت | 377 | 66 |

Same 1,279 rows, same data. The version in the portal reports **six times as
many overdue LCs as the customer's own corrected report**, and one twenty-fifth
as many settled.

The cause is visible in the diff. The shipped copy runs its FIFO settlement
loop only when `@OrderNumber` is supplied:

```sql
DECLARE @ApplyOrderPayableLogic BIT = CASE
    WHEN @OrderNumber IS NOT NULL AND LTRIM(RTRIM(@OrderNumber)) <> N'' THEN 1
    ELSE 0
END;
```

With no order number — the normal way anyone opens a dashboard — it falls back
to comparing each voucher row's own debit against its own payable, which is not
settlement at all. The customer's newer RDL fixed this: it settles every
in-scope order over its complete invoice history, then filters for display
(`IsInDisplayRange`). It also fixed a second bug in the same area — the shipped
copy applies the due-date filter *before* computing settlement, so a date
window truncates each order's FIFO pool and changes balances that have nothing
to do with the window.

**This is the first thing to fix, and it is nearly free**: the corrected query
already exists, in production, on the customer's own server.

---

## 1. What the data actually looks like

Measured, not assumed:

| | |
| --- | ---: |
| Voucher rows on SL `3009` (the LC liability account) | 2,304 |
| Distinct level-6 detail accounts (one per LC) | 139 |
| Rows on SL `9301` (the off-balance opening commitment) | 51 |
| Distinct opening detail accounts | 47 |
| Date range | 2024-05-19 → 2026-09-07 |
| Rows missing `DLTypeRef6` | 0 |
| Unfiltered report runtime | ~10 s |

Every LC detail account follows one convention:

```
سفارش 04130282 ورق خودرو-60 روزه-ش اعتبار *1404281696948/5946904435134691* (اعتبار ملت)
سفارش 037Z10073 فولاد مبارکه-90 روزه-ش اعتبار *ILC279455144456088/279203411114673* (اعتبار بانک شهر)
سفارش 047017645 فولاد مبارکه -60روزه-ش اعتبار *ILC20020304424991963* (اعتبار بانک رفاه)
```

That is: `سفارش <order> <supplier>-<term> روزه-ش اعتبار *<identifiers>* (اعتبار <bank>)`.
Order numbers are **alphanumeric and leading-zero-significant**, 7–10
characters. The LC identifier is **compound** — two slash-separated references
(a bank one and an internal one, sometimes `ILC`-prefixed); one title carries
four.

This consistency is the good news, and it is what makes automated rules over
this data defensible. The `IPR3` module is not in use here and does not need to
be.

---

## 2. Four defects, each measured

### 2.1 The order number loses its first character — 134 of 139 titles

```sql
SUBSTRING(aad.DL6Title, CHARINDEX(N'سفارش ', aad.DL6Title) + 7, …)
```

`اعتبار` is six letters plus a space, so `+ 7` is right for it. `سفارش` is
**five** plus a space. The same offset was used for both. `04130282` comes out
as `4130282`, `037Z10117` as `37Z10117`.

The five titles that survive are the ones where the typist left two spaces —
the accidental filler character the offset assumes.

Consequences, in order of how much they hurt:

- **The شماره سفارش filter silently returns nothing.** A user holding the order
  number from their own paperwork (`04130282`) types it, and matches zero rows,
  because the report stored a different string. There is no error — just an
  empty grid.
- The displayed order number is wrong on 2,274 of 2,304 rows.
- Settlement is **not** affected: no two real order numbers collide once
  truncated (checked — zero collisions), so the FIFO grouping, wrong key and
  all, still groups the right invoices together.

### 2.2 The LC identifier is never extracted — 139 of 139

```sql
PATINDEX(N'%اعتبار %[0-9]%', aad.DL6Title)
```

reads as "…اعتبار, a space, *anything*, then a digit" — the `%` between them
matches any text. So it finds a match on almost every title, returns the
position of `اعتبار`, and `+ 7` lands on the `*` that every real title puts
there. `PATINDEX(N'%[^0-9]%', …)` then returns 1, `LEFT(…, 0)` returns the
**empty string**, and the column is blank on all 1,279 output rows.

### 2.3 The empty string turns the opening match into "match anything"

This is the defect nobody had spotted, and it follows directly from 2.2:

```sql
lco.LCOpeningFullTitle LIKE N'%' + fd.ExtractedLCNumber + N'%'
```

With `ExtractedLCNumber` as `''`, that is `LIKE N'%%'` — **every** opening
record for the same counterparty and bank qualifies. `ROW_NUMBER() … ORDER BY
MatchPriority, OpeningAmount DESC` then keeps the largest.

So the مبلغ گشایش, تاریخ گشایش and مدت گشایش columns show, for 1,098 of 1,279
rows, an opening that belongs to a different LC of the same supplier. Straight
from the report's own internals:

```
order="31060185"  opening="0011405438212383"  amt=1065100000000
order="31060167"  opening="0011405438212383"  amt=1065100000000
```

Two different orders, same opening, same 1,065,100,000,000 rial.

The fix is available because the opening detail accounts are *named by the LC
identifier* — `0011404495541351`, `1404238486327/5946904466410513` — which is
exactly what the `*…*` block contains. Matching identifier segments against
opening titles finds a real match for 47 of 137 LCs; the order number, in
either its truncated or its correct form, matches **nothing** (checked:
zero). Rows with no genuine opening should show none, which is why a correct
implementation reports 560 rows with an opening rather than 1,098.

### 2.4 «معوق» is assigned without ever looking at the date

```sql
CASE WHEN o.RemainingDebt = 0 THEN N'تسویه شده'
     WHEN o.RemainingDebt > 0 THEN N'مازاد پرداخت'
     ELSE N'معوق' END
```

`GETDATE()` appears nowhere. Anything unsettled is "overdue", whether it was
due last year or is due in three months.

Measured on the corrected settlement: of 135 rows labelled معوق, **8 have a due
date in the future** — including one at 17.4 billion rial due 1405/06/23. The
count is small because most of this customer's invoices are genuinely old; the
error is structural, and it is exactly the wrong error for a dashboard whose
purpose is *forward* visibility.

### 2.5 The ones that are not live problems

Reported honestly, because the handoff document treats them as equals and the
data says otherwise:

| Claim | Measured |
| --- | --- |
| Persian/Arabic digits silently break the parse | Real hazard, **zero** titles affected today |
| Invisible RTL/ZWNJ characters break the parse | Real hazard, **zero** titles affected today |
| Joining `FIN3.DL` on `Code` alone can multiply rows | **Zero** codes are shared across detail types |
| LC numbers that are substrings of one another | 3 of 204 segments — minor, guarded by a length floor |

Worth closing anyway (the digit fold costs one pass; `DLTypeRef` is already on
`FIN3.VoucherItem` as `DLTypeRef4/5/6`, so the join needs no configuration and
drops no rows), but they are robustness, not repairs.

And one the data added that no one had listed: **two titles omit the order
number entirely** — `سفارش  فولاد زرین-60 روزه-…`. Any "first number after the
keyword" parser returns `60`, the usance term, pooling eight unrelated voucher
rows under a fictitious order and matching a dozen unrelated openings through
the `LIKE`. The correct answer is to report it missing.

---

## 3. What the product should offer

Three layers, each independently shippable, in dependency order.

### Layer 1 — a report that is right — **done**

`src/lib/reports/sql/lc.sql` now carries all four corrections. No new
concepts, no new UI, no schema change, and the report's output columns and
six parameters are untouched, so `definitions.ts` needed no edit.

1. **Synced to the customer's current RDL.** Zero ambiguity — it is their own
   production logic. 859 معوق becomes 135; 43 تسویه شده becomes 1,078.
2. **Anchored title parse** (§2.1, §2.2). Verified not to change any
   settlement result — the status tally is identical before and after.
3. **Opening matched on the LC identifier** (§2.3). Rows showing a
   مبلغ گشایش drop from 1,098 to 560.
4. **`DLTypeRef` on every `FIN3.DL` join**, and digits folded before parsing.

Verified against the live database, all parameters exercised:

| | shipped before | now |
| --- | ---: | ---: |
| معوق / مازاد / تسویه | 859 / 377 / 43 | 135 / 66 / 1,078 |
| Rows with a blank شماره اعتبار | 1,279 | 16 |
| Rows showing a مبلغ گشایش | 1,098 (mostly another LC's) | 560 |
| Searching order `04130282` | **0 rows** | 50 rows |
| Searching order `4130282` (the truncation) | 50 rows | 0 rows |
| Unfiltered runtime | ~7 s | ~19 s |

The runtime roughly doubles. It stays well inside the report's own
`queryTimeoutSec: 60`, and it buys the opening match and the parse. Getting
there needed one non-obvious thing: SQL Server inlines a CTE at *every*
reference, so hanging per-account work off the row pipeline made it
re-evaluate six window functions per reference — 407 seconds in the worst
arrangement. The per-account work now materializes into `#LcAccount`,
`#LcTitle` and `#LcOpening` before the pipeline starts, which is why the
file opens with a prelude.

Deliberately **not** changed, because they are business rules to confirm rather
than defects to fix: the 5% pre-receipt and mid-receipt rates (the دستورالعمل
mandates a 10% minimum — either these are negotiated rates or a stale
parameter), the Mellat exception keyed on `[5] LIKE N'%ملت%'`, and the
150,000-rial settlement tolerance. Each is a question for the customer's
finance department. None should be quietly "corrected".

**Tell the finance team about the opening column before they find it.** It is
the one change they will notice on sight: fewer rows now show a مبلغ گشایش,
and the missing ones are rows that never had a real opening record to point
at. Only 47 opening accounts exist for 137 LC accounts, so most LCs genuinely
have none.

### Layer 1b — the report people actually review — **done**

Correct numbers were not enough: 1,279 invoice lines is not something a person
reviews. The finance team works **by شماره گشایش and شماره سفارش**, so that is
now the grain of the main report.

**`lc-summary`** — «گزارش ال سی — سطح اعتبار (گشایش × سفارش)». One row per LC
detail account, which in this data is exactly 1:1 with (LC identifier × order
number): **138 rows**, ordered most-urgent-first. Two sections:

| Section | Grain | Rows |
| --- | --- | ---: |
| اعتبارات | شماره گشایش × شماره سفارش | 138 |
| پرداخت‌ها و انتقال‌های انجام‌شده | one voucher line per payment | 936 |

**`lc-report`** — renamed «گزارش ال سی — ریز اقلام (سطر فاکتور)». Unchanged
content; it is now explicitly the drill-down, not the front door.

What changed in the data, beyond the grain:

- **Money is numeric.** The detail report returns `FORMAT(…, 'N0')` strings, so
  the grid sorted "9,000" above "80,000", could not total a column, and sent
  Excel text. The summary returns numbers; the grid formats them with Persian
  separators itself.
- **مانده بدهی is positive when money is owed.** The pipeline's `RemainingDebt`
  is pool − payable, i.e. *negative* when the company owes — backwards for a
  reader.
- **Status is judged against today**: معوق · سررسید امروز · نزدیک سررسید · جاری
  · مازاد پرداخت · تسویه شده, ordered by urgency. «نزدیک سررسید» reads a new
  `@HorizonDays` filter (default 7).
- **New columns the old report had no room for**: درصد مصرف اعتبار, مانده
  اعتبار استفاده‌نشده, قدمت معوق, ageing buckets (۱-۳۰ / ۳۱-۶۰ / ۶۱-۹۰ / +۹۰),
  سررسید امروز/نزدیک/۳۰ روز, and — see below — two columns of colored,
  explained badges instead of one vague count.
- **Payments are visible at all.** The settlement collapses every payment into
  one `AllocatedDebit` per invoice line, so the actual vouchers — date, number,
  type, description, amount — had never been exposed. `lc-payments.sql` reads
  the debit side of SL 3009 directly.
- **20 of 33 columns are hidden by default.** A 33-column wall is its own kind
  of unreviewable; everything is one click away in the column panel.

Verified end to end: filtering to order `047017645` returns 1 LC row and its 14
payment documents, and those 14 payments sum to 534,529,062,781 rial — exactly
the پرداخت‌شده the summary row reports. Two independently computed datasets,
same number to the rial.

**Master-detail, and why it is not LC-specific.** Two stacked grids still meant
retyping a filter and re-running the whole report to see one credit's payments.
The engine had already been grouping child rows by parent key into
`childrenByParentKey` for as long as `parentDatasetId` has existed — nothing
rendered it. Now `MasterDetailSection` does: clicking a master row shows that
key's child rows inline, the master grid gives up height while the detail is
open (so the selected row and its payments stay on screen together), the
detail grid sizes itself to its row count, and `ensureIndexVisible` keeps the
clicked row in frame after the shrink. Selection is a client-side lookup
against data already loaded, so it costs no query. Any report that declares
`parentDatasetId` + `parentKeyFields` gets this.

The join key moved to `src/types/report-result.ts` as `makeDatasetJoinKey` and
the engine's private copy is gone. Two copies of a key-building function on
opposite sides of a network boundary drift silently, and the symptom would be
"clicking a row shows nothing".

### Named, explained, colored — not «۲ ایراد داده»

A count told a reader *something* was uncertain and nothing about what. Now
there are two separate columns, each rendering a "|"-joined list of short
Persian phrases as colored badge chips (`ReportColumn.badges`, generic — any
report column can use it, not just this one):

| Column | Answers | Tone rule |
| --- | --- | --- |
| **ایراد داده** | "how sure is this row?" — the title parser was missing or ambiguous about something, so a number here may be off | danger for the two that silently corrupt a *number* (a missing term backdates سررسید; a multi-bank booking doubles an amount in a per-bank total); warning for the two that just leave a field blank; primary for the one that only ever substitutes a nearby real date |
| **هشدار** | "the row parsed fine — act on this" | danger (currently: usage past the credit's own opening amount) |

Each phrase carries a tooltip (hover a badge) explaining the mechanism, not
just naming it — e.g. «بدون مهلت پرداخت» reads: *"No «روزه» number was found
in the title, so this row's due date defaults to its invoice date with no
term added — which can make a current credit look «معوق» or «نزدیک سررسید»
before it should."* An unrecognized phrase still renders (default tone, no
tooltip) rather than vanishing, so a future SQL change can't silently blank
the cell.

**New detector: booked under more than one bank.** The 138th row from §2
(detail account `85158`, order `031060364`, 3,620,681,392 rial identically
booked under both بانک صادرات and بانک شهر) was a one-off finding when this
was written. It is now a standing check — `Dl6BankCounts` counts distinct
`DL5Code` per `DL6Code` from `#LcAccount`, and any account with more than one
gets «ثبت زیر چند بانک» — so the next occurrence surfaces on its own instead
of waiting for someone to notice the totals don't add up.

**A real bug this surfaced**: adding that check meant reading `#LcAccount`
*after* `lc-core.sql` finishes, which failed with "Invalid object name
'#LcAccount'" — the file's own header comment promised `#LcAccount` as
something "left behind" for the including report, but the cleanup at the end
dropped it anyway alongside the genuinely scratch `#LcTitle`/`#LcOpening`.
Fixed by actually honoring that contract: `#LcAccount` now survives (guarded
by the same start-of-file `IF OBJECT_ID … DROP` pattern `#FinalCalc` already
used, so a leftover from an earlier run on the pooled connection is never a
problem), and only the two tables that are truly single-use scratch get
dropped. Worth flagging because the header comment had been wrong since the
file was first split — nothing had needed to read `#LcAccount` back until now.

Two things worth knowing about the implementation:

- **The pipeline is shared, not copied.** `lc-core.sql` holds it; `lc.sql` and
  `lc-summary.sql` each `-- @include` it and add their own final SELECT, and
  `lc-payments.sql` includes only `lc-accounts.sql` (the parsed titles) because
  it needs no settlement — which is what keeps it at about a second. The
  directive is ~15 lines in `sql-loader.ts`.
- **The payments dataset is declared as a child of the summary**, which makes
  the engine run it *after* rather than in parallel. That is on purpose: root
  datasets run concurrently and so need a second pooled connection, and on this
  customer's network a fresh handshake to the named instance fails far more
  often than it succeeds. Measured — parallel returned "Failed to connect … in
  15000ms"; serial, reusing the warm connection, completes in ~33 s.

The 138th row is a real finding, not an aggregation artifact: detail account
`85158` (order `031060364`, title says «اعتبار صادرات») is booked under **two
different banks** — DL5 `85302` صادرات and `85303` شهر — with the same
3,620,681,392 rial on each. Worth putting to the finance team.

### Layer 2 — an `LC` Business Entity (next)

The architecture doc's gate is now passed: ~10 s for a full scan is fine for
`syncEntity()`, and the title convention is consistent enough to trust. One
caveat the doc anticipated is real — the settlement still runs through a
`CURSOR` over temp tables, which `BusinessEntityDef.sourceSql` cannot host,
since it expects a single parameterless `SELECT`.

Two ways through, and the second is better:

- Rewrite the FIFO allocation set-based (`SUM(…) OVER (PARTITION BY order
  ORDER BY due_date ROWS UNBOUNDED PRECEDING)` against the payment total per
  order). Clean, but it is a re-derivation of the customer's settlement
  semantics, and those semantics are the part of this report they trust.
- **Keep the proven query and materialize it.** The entity layer's contract
  is "one read-only statement producing typed rows with a stable id" — the
  existing batch satisfies that in spirit; only `syncEntity`'s single-`SELECT`
  assumption is in the way. Widening that assumption is a smaller, safer change
  than re-deriving a settlement algorithm that already matches what the finance
  team reconciles against.

Proposed shape, one row per (LC identifier × order number):

| Field | Why a rule needs it |
| --- | --- |
| `orderNumber`, `lcIdentifier`, `bankName`, `counterpartName` | identity and grouping |
| `openingAmount`, `openingDate`, `totalInvoiced`, `usagePct` | credit-line consumption |
| `netPayable`, `totalPaid`, `remainingDebt`, `surplusPayment` | the money |
| `nextDueDate`, `daysUntilDue`, `overdueAmount`, `overdueDays` | **the reason this entity exists** |
| `termDays`, `invoiceCount` | context |
| `dqFlags` | how much of the above to believe |

`daysUntilDue` mirrors the `Receivable` entity's field of the same name
(negative = overdue), so the two read alike in the rule builder — the same
reason `LiquidityPosition` reuses `gap`.

### Layer 3 — the rules, which are the actual product (after Layer 2)

The report answers "what do we owe?". These answer "what should I do today?",
which is the thing worth selling. Each is a handful of lines once the entity
exists, and each maps to a risk the دستورالعمل makes concrete:

| Rule | Condition | Why a CFO cares |
| --- | --- | --- |
| `fin.lc.overdue` | `remainingDebt > 0 AND daysUntilDue < 0` | **A single overdue LC blocks the next opening.** The issuing bank checks non-performing debt before it opens anything. This is not a reporting nicety — it is the company's ability to buy steel next month. |
| `fin.lc.due_soon` | `remainingDebt > 0 AND daysUntilDue BETWEEN 0 AND N` | The cash has to be there on the day. Mirrors `rpa.receivable.due_soon`. |
| `fin.lc.over_utilised` | `totalInvoiced > openingAmount` | Documents accepted beyond the credit limit. |
| `fin.lc.unused_credit` | `openingAmount > 0 AND totalInvoiced = 0` after N days | Opened, paid for, collateral tied up, unused — sleeping working capital. |
| `fin.lc.data_quality` | `dqFlags > 0` | See below. |

The first two are the ones to build. The last one is not optional.

### Why the data-quality rule is not optional

Everything above rests on text a person typed into an accounting field with no
validation. Two titles already omit the order number. The honest way to ship a
dashboard built on that is to have the dashboard report its own reliability —
"137 of 139 LC titles parsed completely today" — as a first-class number a
finance manager can watch.

That is also the strongest argument for the feature commercially. A competitor
can build the same grid. A dashboard that tells you when to stop trusting it is
a different kind of product, and the rule engine, the Notification Center, and
`/admin/rules` are already built to carry it.

---

## 4. Where this belongs, and what generalises

**Module: `FIN`, not `IPR`.** `src/lib/rules/personas.ts` files اعتبار اسنادی
under the tier-4 `foreign-trade` persona (`IPR`, 0 RDLs behind it). That is
right for Rahkaran's foreign-trade module and wrong for this customer, who
books LCs in the general ledger. These rules belong to the CFO persona
alongside the receivable and liquidity rules that already ship.

**On generalising to other customers.** The handoff document proposes making
the SL codes, bank codes and title patterns configurable per tenant, with an
admin UI for "our LC title looks like this". That is the right instinct and the
wrong order — it is the generic-framework-before-the-second-customer trap the
architecture doc's §1.2 already argues against, and this investigation is
evidence for that position: the useful work here was not a pattern-configuration
engine, it was *reading one customer's 139 titles and finding that four things
were wrong*. Extract the configuration when a second customer's data is in
front of us and shows which parts actually differ.

What is worth doing now, because it costs almost nothing:

- The SL codes (`3009`, `9301`) and the account group (`9`) are already
  constants in one file. Leave them there; name them.
- `src/lib/reports/lc-title.ts` holds the parse as a tested TypeScript
  function, with the T-SQL as its twin. When a second customer arrives with a
  different convention, that file is the seam — one function, eleven tests,
  and a probe that measures agreement against real data.
- An `IPR3.LetterOfCredit` adapter, for customers who did deploy the module,
  is a genuinely different source and a genuinely separate entity. Build it
  when such a customer exists.

---

## 5. Open questions for the customer's finance team

Not blockers for Layer 1, but each changes a number on the screen, and none of
them should be resolved by us guessing:

1. **5% + 5%, or 10% + 10%?** The دستورالعمل mandates a 10% minimum for
   pre-receipt and mid-receipt. The report computes 5% each. Negotiated rate,
   or stale parameter?
2. **Why is Mellat exempt?** The exception is keyed on the bank's *title*
   containing «ملت», which would also catch any future account whose name
   happens to contain it.
3. **Which identifier is "the" LC number?** Titles carry two, and once four.
   The report should label whichever one the bank uses on correspondence.
4. **Where does the 150,000-rial tolerance come from?** It is neither a
   parameter nor documented, and it decides whether a row reads تسویه شده or
   معوق.
5. **Which invoice date is authoritative** when the description carries no
   `14xx/xx/xx` — is falling back to the voucher date acceptable, or should
   those rows be flagged instead?
6. **Order `031060364` / detail account `85158`, now flagged automatically
   as «ثبت زیر چند بانک»** — 3,620,681,392 rial booked identically under both
   بانک صادرات and بانک شهر. Real duplicate booking, correction of a wrong
   bank code, or something else? The finance team is the only one who can
   say; the report can only point at it.

---

## 6. Tools this investigation left behind

| | |
| --- | --- |
| `npm run lc:probe` | Read-only. Volume, parse reliability, the shipped parser vs. the corrected one, identifier collisions, detail-code duplication, due-date distribution, opening coverage. `--timing` also times the full report. |
| `npm run lc:probe -- --json out.json` | The same, machine-readable. |
| `src/lib/reports/lc-title.ts` | The parse, in TypeScript, as the reference implementation. |
| `src/lib/reports/__tests__/lc-title.test.ts` | Eleven cases, ten of them verbatim real titles. |

The probe is what makes the numbers in this document re-checkable rather than a
snapshot of one afternoon. Run it before changing the parse; run it after.
