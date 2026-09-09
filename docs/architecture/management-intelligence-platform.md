# Management Intelligence & Decision Platform — Architecture Analysis

Status: **Phases 1–6 shipped** (Rule Engine, Notification Center, semantic
layer v1, Entity Rule Builder, Dashboard v2's alert/KPI widgets, and the
copilot extension — all scoped to the Receivable entity) — see §14 for the
phase list. More entities, full multi-dashboard infrastructure, and
per-role access are still proposal only, deferred deliberately (see each
phase's note for why). This document analyzes the Product Brief
("ERP Management Intelligence & Decision Platform") against the codebase as it
exists today, flags where the brief's assumptions conflict with decisions
already made and shipped, and proposes a concrete, incremental architecture
for the next phases.

Companion reading: [../README.md](../README.md) (what already ships),
[report-packages.md](../guides/report-packages.md) (the export/import pattern
this proposal reuses for rules/dashboards/entities).

---

## 0. The one thing to understand before anything else

**This is not a greenfield product.** Insight Portal already implements a
large slice of the brief's MVP:

| Brief asks for (section) | Already shipped as |
| --- | --- |
| Secure, read-only ERP connection (§4) | `RAHKARAN_DB_*` read-only login, `mssql` pool, `src/lib/db/rahkaran.ts` |
| Provider/Connector abstraction (§6) | `DataSourceProvider` interface, `src/lib/reports/providers/{rahkaran,attendance}.ts` |
| RDL alongside a modern viewer (§3) | RDL import → **convert once** → native report (deliberately *not* dual-runtime — see §2.1) |
| Dashboard / KPI / charts (§14) | `DashboardWidget` model, AG Grid + ECharts, computed `DashboardData` (KPIs, recent, favorites, module cards) |
| Scheduled reports (§16) | `ReportSchedule` + `scripts/run-schedules.ts` (cron-friendly), email via nodemailer |
| Access control (§17) | `User`/`Role`/`UserModuleAccess`/`RoleModuleAccess`/`UserReportAccess`/`RoleReportAccess` |
| Audit log (§18) | `AuditLog` model, written on execute/export/schedule |
| Business Rule Engine, v1 (§7–§13) | `src/lib/rules/*` — read-only SQL "rules", severity, packs, health score, whitelist (`RuleException`) |
| AI copilot, grounded (§21) | `src/lib/copilot/*` — tool-calling LLM restricted to admins, **cannot** generate its own SQL |
| Product-not-project, configuration over code (§22) | `.insight-report.json` package export/import, white-label `AppSettings`, setup wizard |

What's genuinely missing is narrower than the brief implies:

1. The rule engine is **CLI-only** — it has no web UI, no persisted findings,
   no schedule, no notifications. It proves the value proposition but doesn't
   deliver it continuously.
2. There is **no Business/Semantic Entity layer** — rules and reports both
   read Rahkaran directly via hand-written T-SQL. There is no `LC`, no `Bank
   Account`, no typed business object.
3. There is **no user-facing Rule Builder** — rules are TypeScript files a
   developer edits, not database rows a business user configures.
4. There is **no Notification Center** and no persisted finding lifecycle
   (new / acknowledged / resolved).
5. Dashboards are a **single flat admin-managed list**, not a per-role/
   per-user Dashboard Builder with layout.
6. **Multi-tenancy** is undecided in the brief; the codebase has already,
   implicitly, chosen single-tenant-per-install (§22 will make this explicit
   and defend it).

Everything below is framed as **evolving what exists**, not replacing it.

---

## 1. Architecture problems and misconceptions in the brief

The brief explicitly asked for this — here it is, direct:

### 1.1 §3 assumes a dual report runtime (RDL + modern viewer). Reject this.

The brief pictures RDL reports and native reports living side by side
indefinitely, with the platform rendering both. **The codebase already made
the opposite call, and it's the right one**: RDL is a one-time *import and
convert* path (`/admin/rdl` → parse → convert to a native Studio report), and
"Insight SQL is the only runtime" (see `docs/README.md`). Maintaining a live
SSRS/RDL rendering engine (paginated layout, expressions, sub-reports,
tablix) alongside a modern grid/chart engine is a second product's worth of
surface area, for a format you're trying to retire. Convert once, throw the
renderer away. Keep this decision; do not revisit it because the brief
assumed otherwise.

### 1.2 §5/§6 overstate how "semantic" the layer needs to be, this early

The brief's Business Entity vision (LC, Bank Account, Invoice as fully
modeled objects with a generic entity framework) is the right *direction* but
the wrong *starting altitude*. Building a generic entity-modeling engine
before you have 2–3 real entities under contract is how this class of
product stalls forever (the brief's own §24 says as much, then §5–§10 half
contradict it by sketching a fairly generic system). Concretely:

- The **rule author is you** (or another implementer), not the factory's
  CFO. The brief's §26 principle — "user thinks in business concepts, not
  database concepts" — applies to the **business user configuring
  thresholds and reading alerts**, not to the person building the rule pack.
  Nothing is wrong with a developer writing `FIN3.Voucher` T-SQL today, the
  same way `src/lib/rules/packs/*.ts` already does. The semantic layer exists
  to let a *business user* tune `10 days` → `15 days` and pick which
  customers count as "high risk", not to eliminate SQL from the codebase.
- So: build the semantic layer **narrow and concrete** (§8 below), driven by
  the handful of entities the brief itself names as valuable (LC, Bank
  Balance, Receivable, Inventory), not as a generic "any ERP object"
  abstraction.

### 1.3 §22 multi-tenant question — answer: no, and don't build one

Rahkaran deployments are one SQL Server per company, often on-prem, often
behind a VPN, with data-residency and access-control expectations that make a
shared multi-tenant database actively harmful to sell into this market (a
CFO will ask "is my ledger in the same database as our competitor's" and the
honest multi-tenant answer is disqualifying). The product-not-project goal in
§22 does **not** require shared infrastructure — it requires that the *same
codebase* deploys per customer with *configuration*, which is exactly the
pattern already built:

```
Customer A install          Customer B install
  Insight Portal (same code)   Insight Portal (same code)
  own SQL Server (app db)      own SQL Server (app db)
  own Rahkaran connection      own Rahkaran connection
  own AppSettings (branding)   own AppSettings (branding)
  imported .insight-report.json packages, rule packs, dashboards
```

Keep **single-tenant-per-install**. Extend the existing package/export
pattern (today: `.insight-report.json`) to rule packs, dashboards, and (once
built) entity definitions, so "the same product, different configuration"
means *shipping a config bundle to a new install*, not forking code. This is
strictly simpler to secure, reason about, and support.

### 1.4 The copilot's grounding rule is correct — generalize it, don't relax it

`src/lib/copilot/tools.ts` already encodes the single most important safety
rule for this whole product: **the model never writes its own SQL; it only
calls pre-verified reports and rules**. This is the same reason the semantic
layer's Rule DSL (§10) must stay a bounded condition tree, not an escape
hatch to raw SQL, and the same reason "custom rules" for business users (§9)
must be scoped to semantic entities, never to arbitrary tables. Treat this as
a standing architectural invariant, not a copilot-specific detail.

---

## 2. Target architecture (incremental, layered)

```
                         Rahkaran / other ERP (read-only)
                                     │
                     ┌───────────────┴────────────────┐
                     │      Data Source Providers      │  (exists: rahkaran, attendance)
                     └───────────────┬────────────────┘
                                     │
              ┌──────────────────────┼───────────────────────┐
              │                      │                       │
      Reports / Studio      Predefined Rules (SQL)     Semantic Entity Sync
      (exists, live query)  (exists, live query,       (NEW — materializes a
                              scheduled)                 small curated set of
                                     │                     entities into the app DB)
                                     │                       │
                                     │              ┌────────┴────────┐
                                     │              │  Entity Rules   │  (NEW — JSON condition
                                     │              │  (bounded DSL)  │   tree over materialized
                                     │              └────────┬────────┘   entity tables)
                                     │                       │
                     ┌───────────────┴───────────────────────┘
                     │
             Rule Findings (NEW — persisted, lifecycle: new/ack/resolved)
                     │
        ┌────────────┼─────────────────┐
        │            │                 │
   Dashboard    Notification      Audit Log (exists)
   (existing +  Center (NEW:            │
   NEW layout)  email exists,      Access Control (exists,
                in-app + Telegram  extended to entities/rules/
                later)             dashboards)
                     │
                  Copilot (exists, extended to read entities/findings)
```

Nothing here introduces a new datastore, a new backend service, or a new
language/runtime. It is additive to the current Next.js + Prisma + SQL
Server monolith.

---

## 3. Tech stack — keep it

No change recommended. Next.js 16 + TypeScript + Prisma + SQL Server +
Auth.js + AG Grid + ECharts is already the right stack for this problem:
server-rendered admin-heavy CRUD, a proven read-only ERP driver (`mssql`),
Excel/PDF export already solved, RTL/Persian already solved. Introducing a
second backend service (e.g. a Python rule-evaluation microservice, a
message queue, a separate BFF) would add operational surface (one more
process to deploy per on-prem customer) without a problem that justifies it
at this scale. Revisit only if/when a specific bottleneck is measured (see
§13 Scalability).

---

## 4. Database architecture

One database per install remains correct: **the Prisma-managed app database**
(currently holding users, reports, schedules, audit, branding) grows to also
hold:

- Rule configuration & lifecycle (`RuleDefinition`, `RuleSchedule`,
  `RuleRun`, `RuleFinding` — see §6)
- Semantic entity materializations (`EntitySnapshot`-style tables — see §5)
- Dashboards v2 (`Dashboard`, widgets gain `dashboardId` + layout)
- Notifications (`Notification`)

This stays a single SQL Server database per customer — do **not** stand up a
separate "semantic layer database" or a data warehouse for MVP. The
materialized entity tables are just more Prisma tables in the same app DB
they already maintain. Reconsider only when a customer's entity volume or
refresh frequency genuinely outgrows that (unlikely for LC/bank/receivable-
scale data at a single company).

---

## 5. Semantic / Business Entity layer (narrow, concrete design)

### 5.1 What it is

A **Business Entity** is a config-driven, named, typed projection of ERP data
into the app database, refreshed on a schedule. Not a live query pass-
through, not a generic modeling framework — a materialization job plus a
typed table.

```ts
// Illustrative shape — not a generic "build any entity" DSL.
interface BusinessEntityDef {
  key: string;              // "LC"
  labelFa: string;
  providerKey: string;      // "rahkaran"
  sourceSql: string;        // one read-only SELECT, developer-authored,
                            // same trust level as a Rule's SQL today
  fields: {
    key: string;            // "daysUntilExpiry"
    labelFa: string;
    type: "number" | "string" | "date" | "boolean";
  }[];
  refresh: { mode: "cron"; schedule: string } | { mode: "on-demand" };
}
```

`sourceSql` is written by an implementer (you), exactly like today's rule SQL
— the semantic layer does not remove SQL from the codebase, it gives the
*result* of that SQL a stable, typed, business-named home that a
non-technical rule builder and dashboard builder can point at.

### 5.2 Where it lives and how it refreshes

A scheduled job (same mechanism as `scripts/run-schedules.ts`, generalized —
see §9.3) runs each entity's `sourceSql` against its provider, and upserts
the results into a Prisma table (`EntityRecord` with a JSON `data` column, or
one physical table per entity if the fields are stable enough — start with
the generic JSON-column table; only promote an entity to its own physical
table if a rule/dashboard needs to filter/sort at a scale the JSON approach
can't handle). This is deliberately an **ELT snapshot**, not a live view:

- Isolates Rahkaran from repeated ad hoc query load (rules and dashboards
  read the snapshot, not the ERP, most of the time).
- Gives you `first_seen` / `last_seen` for free, which the Rule Finding
  lifecycle (§6) needs anyway.
- A `refresh: on-demand` mode covers the "I need this number right now"
  case (dashboard "refresh" button) without changing the model.

### 5.3 Which entities, and when

Model only the entities the brief itself names as valuable and that back a
real rule or dashboard: **LC, Bank Account/Balance, Receivable, Inventory**
first. Do not pre-model Customer/Supplier/Contract/Employee speculatively —
add an entity when a rule or dashboard widget needs it, matching brief §24's
own restraint.

---

## 6. Rule Engine v2 — architecture and data model

Two rule *kinds*, one execution and notification pipeline:

| | Predefined (SQL) rules | Entity rules |
| --- | --- | --- |
| Exists today? | Yes (`src/lib/rules/packs/*.ts`) | No — new |
| Authored by | Developer/implementer | Admin/business user, via a constrained builder UI |
| Reads | Provider directly (live query) | Materialized `BusinessEntity` snapshot |
| Expressed as | Parameterized T-SQL | JSON condition tree (§7) |
| Risk profile | Same as a hand-reviewed report — trusted | Must be safely compilable/interpretable — bounded to entity fields and a fixed operator set |

Persisted model (new Prisma models):

```prisma
model RuleDefinition {
  id            String   @id @default(cuid())
  kind          String   // "predefined" | "entity"
  ruleCode      String?  // for predefined: matches src/lib/rules/packs id
  entityKey     String?  // for entity rules: which BusinessEntity
  titleFa       String
  conditionJson String?  @db.NVarChar(Max) // entity rules only — see §7
  paramsJson    String   @db.NVarChar(Max) // threshold overrides for predefined rules
  severity      String
  isEnabled     Boolean  @default(true)
  createdBy     String?
  updatedAt     DateTime @updatedAt
}

model RuleSchedule {
  id          String   @id @default(cuid())
  ruleDefId   String
  frequency   String   // "daily" | "hourly" | ... — mirrors ReportSchedule
  runAt       String?
  isActive    Boolean  @default(true)
  lastRunAt   DateTime?
  nextRunAt   DateTime?
}

model RuleRun {
  id          String   @id @default(cuid())
  ruleDefId   String
  runAt       DateTime @default(now())
  durationMs  Int
  status      String   // "ok" | "error"
  findingCount Int
  totalAmount Float?
  error       String?
}

/// Persisted finding lifecycle — distinct from RuleException (a permanent
/// whitelist). This is "is this specific problem still open right now".
model RuleFinding {
  id          String   @id @default(cuid())
  ruleDefId   String
  entityId    String   // matches RuleFindingRow.entity_id
  status      String   // "new" | "acknowledged" | "resolved" | "snoozed"
  firstSeenAt DateTime @default(now())
  lastSeenAt  DateTime @updatedAt
  resolvedAt  DateTime?
  resolvedBy  String?
  snapshot    String   @db.NVarChar(Max) // last known title/detail/amount

  @@unique([ruleDefId, entityId])
}
```

Execution flow (extends, does not replace, `runRules()` in
`src/lib/rules/engine.ts`):

```
RuleSchedule due
    → load RuleDefinition
    → predefined: renderSql + runRule() (existing code, unchanged)
    → entity:     compile conditionJson → SQL against EntityRecord snapshot
    → upsert RuleFinding (new → still-open → resolved when no longer found)
    → write RuleRun (history/audit)
    → diff against previous state → dispatch Notifications for genuinely
      new findings and severity escalations only (not every still-open one —
      this is what makes a daily digest useful instead of spam)
```

`RuleException` (the existing whitelist table) keeps its exact current job:
a human says "this specific entity_id will never be a real problem for this
rule." `RuleFinding` is a different axis (temporal state of a still-valid
finding), and both apply together: a finding can be whitelisted *and* would
otherwise be "new" — whitelisting suppresses it before it ever becomes a
`RuleFinding`/notification, same as `applyExceptions()` does today.

---

## 7. Rule DSL — concrete shape

A bounded condition tree, not a generic expression language, not an AST for
arbitrary logic:

```json
{
  "entity": "LC",
  "all": [
    { "field": "daysUntilExpiry", "op": "lt", "value": 10 },
    { "field": "status", "op": "eq", "value": "Active" }
  ]
}
```

```json
{
  "entity": "Receivable",
  "all": [
    { "field": "totalOutstanding", "op": "gt", "value": 5000000000 },
    { "field": "oldestDueDays", "op": "gt", "value": 90 }
  ]
}
```

Grammar (deliberately small):

- A node is either a **group** (`all` = AND, `any` = OR, nestable) or a
  **condition** (`field`, `op`, `value`).
- `field` must be a key declared on that entity's `BusinessEntityDef` —
  reject anything else at save time, not at run time.
- `op` ∈ `{eq, ne, lt, lte, gt, gte, in, contains}` — no arbitrary
  expressions, no subqueries, no cross-entity joins in v1 (a rule that needs
  two entities together, e.g. "bank balance < payments due next 7 days",
  becomes a **new synthetic entity** — see the liquidity example below —
  not a join capability in the DSL).
- Compiles to a single parameterized `WHERE` clause against that entity's
  `EntityRecord` snapshot table — never string-concatenated, values always
  bound as SQL parameters (same discipline `renderSql()` already applies to
  predefined rules).

For the brief's liquidity example (bank balance vs. upcoming obligations),
model it as its own small entity computed at materialization time (e.g. a
`LiquidityPosition` entity whose `sourceSql` already computes
`bankBalance`, `next7dObligations`, `gap`), then the rule is a plain
single-entity condition (`gap < 0`). This is the practical resolution of
"the DSL doesn't do joins": push the join into the entity's SQL (developer-
authored, trusted), keep the business-user-facing rule simple.

This is intentionally less powerful than a generic rule language (Drools-
style, or a full expression AST). That's the point — the moment a customer
needs logic the tree can't express, that logic becomes a new named entity
field or a new predefined rule, both of which stay in code review, not in an
unbounded end-user scripting surface.

---

## 8. Security & Permission model

Extend the existing, proven pattern — do not invent a new permission engine:

| Existing | New, same shape |
| --- | --- |
| `UserModuleAccess` / `RoleModuleAccess` | `UserEntityAccess` / `RoleEntityAccess` — who can see LC / Receivable / … findings and dashboard widgets bound to them |
| `UserReportAccess` / `RoleReportAccess` | `UserRuleAccess` / `RoleRuleAccess` — who can configure/view a given rule |
| (new) | `DashboardAccess` (per dashboard, once dashboards are no longer a single global list — §9.4) |

Rahkaran access stays exactly as documented: one read-only login, never
written to, credentials only in server-side env. The semantic layer does not
change this — the materialization job runs with the same read-only
credential the report engine already uses.

---

## 9. Rollout-relevant subsystems (dashboard, scheduling, notifications, audit)

### 9.1 Dashboard v2

Add a `Dashboard` model (many, not one global list); `DashboardWidget` gains
`dashboardId` and a layout (`x, y, w, h`) column. Widget `config` keeps its
existing free-form JSON, but gains two new bindable sources alongside the
existing `report-pin`/`chart`/`text` types: `entity-kpi` (a number off a
`BusinessEntityDef` field, e.g. "current bank balance") and `rule-alert-list`
(open `RuleFinding`s for one or more rules, worst-first — this is the "🔴
Critical Alerts" panel from the brief's mockup, and it is *directly* the
already-built health-score/finding data, just rendered as a widget instead
of a CLI report).

### 9.2 Scheduling

Generalize `ReportSchedule` + `run-schedules.ts` into a shared internal
scheduler used by both reports and rules, rather than building a second
scheduler for `RuleSchedule`. Both are "run X at time T, on frequency F,
notify Y" — the existing cron-friendly script pattern (external OS
scheduler → `npx tsx scripts/run-schedules.ts`) extends to rules with no new
infrastructure.

### 9.3 Notification Center

- `Notification` model: `userId` (or `roleId` for broadcast), `severity`,
  `title`, `body`, `sourceType` ("rule_finding" | "schedule_failure" | …),
  `sourceId`, `readAt`.
- Delivery channels are pluggable, mirroring the provider pattern: email
  exists (`src/lib/email/send.ts`, reuse as-is); Telegram/SMS/in-app are
  additional senders behind the same `Notification` row, added when a
  customer actually asks, not speculatively.
- In-app bell reads `Notification` rows scoped by the same
  Role/User/EntityAccess permissions as everything else.

### 9.4 Audit

`AuditLog.action` taxonomy grows (`rule.run`, `rule.finding.acknowledge`,
`rule.finding.resolve`, `rule.definition.update`, `notification.dispatch`)
using the exact same table and write path already in place — no schema
change beyond new string values.

---

## 10. Scalability & performance

The real risk was never web-tier scale (single company, tens to low
hundreds of concurrent users) — it's **hammering a production Rahkaran
box**. Mitigations, in order of how much they already exist:

- **Row caps** — `MAX_FINDINGS_PER_RULE = 500` already exists; apply the
  same discipline to entity materialization queries.
- **Sequential rule execution** — already deliberate in `runRules()`
  ("a read-only guest has no business saturating it"); keep it for entity
  sync jobs too.
- **Off-peak scheduling** — entity refresh and rule runs scheduled outside
  ERP-heavy hours where the customer's usage pattern allows; per-entity
  refresh frequency tunable (bank balance might need hourly, LC list is
  fine daily).
- **Materialization is the caching layer** — once entities exist, dashboards
  and entity-rules stop querying Rahkaran per view; only the scheduled
  sync job does. This is the single biggest lever, and it's a natural
  byproduct of §5, not extra work.
- **Query timeouts** — already applied ad hoc (`request.timeout = 8000` in
  `dashboard/data.ts`); make it a standard wrapper for provider queries
  rather than a per-call convention.

No message queue, no separate worker fleet, no read replica needed at this
scale. Revisit if a specific customer's ERP box or data volume proves this
wrong — don't pre-build for it.

---

## 11. Deployment

Unchanged: one Next.js process (PM2/Windows service) + one SQL Server app
database + a read-only Rahkaran connection, per customer install, per
[deploy-and-ops.md](../guides/deploy-and-ops.md). The scheduler/cron
addition for rules reuses the same "external scheduler calls an tsx script"
mechanism already documented there. This is consistent with the
single-tenant-per-install decision in §1.3 — there is no shared control
plane to build or operate.

---

## 12. AI Copilot evolution

Keep the grounding invariant from §1.4. Extend `src/lib/copilot/tools.ts`
with two new tool functions once §5–§6 exist:

- `queryEntity(entityKey, filters)` — reads the materialized snapshot,
  same trust level as `runReportTool`.
- `explainFinding(ruleFindingId)` — returns the finding's snapshot, the
  rule definition that produced it, and its history (first seen, prior
  status changes) — this is what makes "چرا این هشدار صادر شد؟" answerable
  without the model inventing anything.

Do not add a "let the model write SQL against Rahkaran" tool, ever, even
behind an admin flag — that's the one line this product should not cross,
and the existing code already respects it.

---

## 13. What not to build now (reaffirming and extending brief §24)

Explicitly deferred, no architecture debt incurred by waiting:

- Full generic entity-modeling UI (no-code "define any object") — model
  entities in code (§5.3) until customer count/variety actually demands a
  UI for it.
- Cross-entity joins in the Rule DSL — push joins into entity `sourceSql`
  instead (§7).
- A second backend service/language, message queue, or data warehouse.
- Real-time/event-driven rule triggers (LC status changed → fire
  immediately) — schedule-based (daily/hourly) covers every example in the
  brief; add event-driven only when a customer needs sub-hour latency for a
  specific rule.
- Multi-ERP abstraction beyond what `DataSourceProvider` already gives you
  — add a second real provider when a second real ERP customer exists, not
  before.
- Action/workflow engine (approval flows, ERP writebacks) — notifications
  and dashboards first; the brief itself places this last (§13) and it
  implies writing back to the ERP, which is a much larger trust and safety
  question than anything above.

---

## 14. Proposed roadmap

Each phase is additive to the current codebase; nothing here requires a
rewrite of an existing subsystem.

**Phase 1 — Rule Engine goes live (highest value, lowest risk) — ✅ shipped**
`RuleDefinition` (predefined kind only, wrapping today's `packs/*.ts`),
`RuleSchedule`-equivalent fields on it, `RuleRun`, `RuleFinding`. Admin UI at
`/admin/rules`: enable/disable a predefined rule, tune its `RuleParam`
thresholds, set its schedule, run now, acknowledge/resolve findings. Reuses
`runRule()`/`runRules()` from Phase 0 unchanged (`src/lib/rules/persistence.ts`
is the new orchestration layer on top). `npm run rules:run` is the cron
entry point. Verified against a real Rahkaran connection — see the
connection-retry/warm-pool hardening added to `src/lib/db/rahkaran.ts` as a
direct result of that test; the underlying network path to an on-prem
Rahkaran box can still have outage windows a fixed number of retries won't
ride through, which is an infra/VPN question, not something the app can
fully paper over.

**Phase 2 — Notification Center — ✅ shipped**
`Notification` model, in-app bell (`src/components/layout/notification-bell.tsx`,
polls every 60s), `npm run notifications:digest` email digest (reuses the
existing SMTP path). Wired directly into the Phase 1 finding-reconciliation
step (`src/lib/rules/persistence.ts`): a finding notifies on `new` or
`reopened`, never on every run it's still open, so the bell stays signal
not noise. Acknowledge/resolve actions already wrote to `AuditLog` in
Phase 1; unchanged here.

**Phase 3 — Semantic layer v1 — ✅ shipped, scoped to Receivable only**
`BusinessEntityDef` + `EntityRecord` (generic JSON-column snapshot table —
`src/lib/entities/`). Pull-based materialization: `syncEntity()` runs
immediately before an entity-backed rule evaluates, not on its own
schedule — simpler than the doc originally sketched, and correct at this
scale. Migrated `rpa.receivable.overdue_uncollected` and
`rpa.receivable.due_soon` (`src/lib/rules/packs/finance-daily.ts`) to read
the new `Receivable` entity instead of two near-duplicate SQL queries — the
reference implementation, live-verified against شرکت فولاد بهمن's real data
(209 materialized receivable notes, both rules producing correct real
findings). `rpa.receivable.dishonoured` deliberately stays SQL-only — it
reads a genuinely different note-state filter, not a slice of this entity.

LC and Bank/Liquidity were **not** modeled. Bank/Liquidity: no source
identified yet. LC: checked `src/lib/reports/sql/lc.sql` (now confirmed,
not speculative) — this customer *does* track LCs, but not through the IPR
module or any clean LC table. It's `FIN3.VoucherItem`/`DL` general-ledger
entries (`SLCode = '3009'`), with the LC number and order number embedded
as free text inside detail-account titles and extracted via
`PATINDEX`/`CHARINDEX`, plus a **cursor-based FIFO debt-settlement
calculation** in temp tables (`#FinalCalc`, `@RowDebt`, an `order_cursor`
loop) computing each LC's remaining balance. It also takes six bound
parameters (`@dl4`, `@dl5`, `@OrderNumber`, `@STARTDATE`, `@ENDDATE`,
`@DebtStatus`).

This is a bad first candidate for `BusinessEntityDef.sourceSql`, which
`syncEntity()` expects to be one parameterless read-only `SELECT` cheap
enough to run unattended on a schedule. Before modeling an LC entity,
someone needs to answer, from real usage: is the unfiltered full-scan
(all `@params` NULL) fast enough to sync periodically, or does the cursor
loop make it report-only? Is title-text parsing reliable enough to trust
in an automated rule, or does it need a human's eyes on each match the
way the report presumably gets today? Don't guess — ask whoever runs this
report today, or watch its actual execution time first. Model the next
entity when a real rule needs it and its source query's shape is
understood (§5.3's own rule), not preemptively.

`Rule` gained `kind: "sql" | "entity"` (§10's `Rule.evaluate` from the
original proposal, implemented as a plain TypeScript function over the
entity's records rather than a JSON condition tree — the bounded DSL from
§7 is still Phase 4 scope, for when rules need to be business-user-authored
rather than developer-authored).

**Phase 4 — Entity Rule Builder — ✅ shipped, scoped to Receivable only**
The bounded condition-tree DSL (`src/lib/entities/condition.ts`) plus a
form-based UI (field/operator/value rows, AND-only in v1 — the evaluator and
schema already support nested AND/OR groups, only the builder form doesn't
expose them yet) — a business user picks an entity, adds conditions, sets
severity and schedule, no code or SQL. `RuleDefinition` gained `kind:
"predefined" | "custom"`; a custom row synthesizes a `Rule` at run time
(`src/lib/rules/custom.ts`) so the exact same engine that runs code-defined
rules runs these too. Findings get a generically-composed title/detail from
the entity's declared fields (no hand-written Persian copy — that's the
trade-off for not needing a developer per rule). Live-verified: created
"چک‌های درشت نزدیک سررسید" (large checks near due date — `daysUntilDue <=
N AND amount > 500M Rial`) entirely through the UI against شرکت فولاد
بهمن's real data, got 101 correct real findings with real counterparty
names and amounts, then edited its threshold and confirmed the persisted
condition JSON updated correctly.

`RoleEntityAccess`/`RoleRuleAccess` (per-role visibility into entities and
rules) were **not** built — not needed yet with one entity and 8 admins who
all see everything; becomes necessary once a second entity or a
non-financial role enters the picture (see §8's original permission-model
sketch for the shape it should take).

**Phase 5 — Dashboard v2 — ✅ shipped, content only (no new infrastructure)**
Two new `DashboardWidget` types on the *existing* single dashboard —
`rule-alerts` (open findings worst-first, the brief's own "🔴 Critical
Alerts" mockup) and `entity-kpi` (count/sum over a materialized entity,
optionally condition-filtered) — computed server-side in
`getDashboardData()` and never live-querying Rahkaran on a page view (reads
`RuleFinding`/`EntityRecord`, both already kept fresh by the rule engine).
Deliberately did **not** build the `Dashboard` (many)/layout(x,y,w,h)/
`DashboardAccess` infrastructure the doc originally sketched — same
reasoning as every other phase's scope cut: one dashboard and 8 admins who
all see everything don't need it yet, and building it before a second
dashboard's actual shape is known would be guessing. Live-verified against
شرکت فولاد بهمن's real data: a "هشدارهای بحرانی" widget correctly listing
real critical findings (company names, check numbers, real Rial amounts)
and a "مجموع چک‌های دریافتنی باز" KPI correctly summing to ~2.39 trillion
Rial across all materialized receivables.

**Phase 6 — Copilot over the semantic layer — ✅ shipped**
Five new grounded tools in `src/lib/copilot/tools.ts` — `list_open_findings`,
`explain_finding`, `list_entities`, `entity_summary`, `query_entity_records`
— all reading persisted `RuleFinding`/`EntityRecord` data, never Rahkaran
directly, so they answer instantly and can never diverge from what the
dashboard already shows (verified: `entity_summary`'s amount total and
`query_entity_records`'s overdue count match the dashboard KPI widget and
the `overdue_uncollected` rule's finding count exactly — three independent
code paths, one number). `query_entity_records` reuses the exact same
condition DSL as the Entity Rule Builder (Phase 4), so the copilot's filter
vocabulary and a business user's rule vocabulary are the same thing, not
two parallel query languages to maintain.

Not verified end-to-end: the LLM side. This repo's copilot runs against a
local Ollama instance for on-prem deployability, and — as the original
Phase 0 implementation already noted in its own comments — no Ollama
install was available to test the tool-calling loop against a live model,
here or previously. The tool functions themselves are proven correct
against real data; whether a given Ollama model reliably chooses to call
them is untested and worth confirming against the actual model the
customer's server will run before relying on this in front of them.

**Later, only on customer-proven demand:** additional entities, a second
ERP provider, event-driven triggers, action/workflow engine.

---

## 15. Summary judgment

The brief's north star (§27: ERP holds data, this product turns it into
insight/alerts/decisions) is sound and the codebase is already most of the
way there for the *reporting and alerting* half. The two corrections that
matter most: **don't build a dual RDL runtime** (already correctly avoided)
and **don't build a generic semantic/rule platform before three real
entities and one real customer prove which parts of it are worth
generalizing** (the brief's own §24 discipline, applied one section earlier
than the brief applies it). Everything else in this document is sequencing
of things the brief already asked for, on top of infrastructure that
already exists.
