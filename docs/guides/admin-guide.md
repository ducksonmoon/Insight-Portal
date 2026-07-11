# Admin guide

For portal administrators: modules, reports, access, and branding.

---

## Roles

| Role | Access |
| ---- | ------ |
| **Admin** | Full access: Studio, RDL manager, modules, access control, settings |
| **User** | Only modules/reports granted on `/access` |

Admins always see all reports. Everyone else needs explicit grants.

---

## First day checklist

1. **Sign in** at `/login` (or complete `/setup` on a fresh install).
2. **Modules & folders** (`/modules`) — create business areas (e.g. `financial`, `warehouse`) and optional nested folders.
3. **Access** (`/access`) — sync users from Rahkaran (optional), set app passwords, grant modules and/or individual reports.
4. **Sample run** — open **گزارش‌ها**, pick a report, set filters (Jalali dates like `1404/01/01`), run, export Excel.
5. **Create or migrate reports** — see [RDL migration](./rdl-migration.md) or [Report packages](./report-packages.md).
6. **Branding** (`/settings`) — logo, colors, company name for white-label delivery.

---

## Creating a new report

Go to **استودیو گزارش** → **گزارش جدید** (`/admin/reports/new`). The hub offers three paths:

| Option | When to use |
| ------ | ----------- |
| **گزارش جدید در استودیو** | New SQL report from scratch |
| **وارد کردن بسته** | Restore or copy `.insight-report.json` from another server |
| **بارگذاری RDL** | Legacy SSRS/Rahkaran `.rdl` — inspect then convert |

Studio direct link: `/admin/reports/new?mode=studio`.

There is **no** end-user toggle between “RDL view” and “Insight view”. All published reports run through the same SQL engine.

---

## Report Studio workflow

Path: `/admin/reports` or `/admin/reports/{slug}/edit`

1. **SQL** — paste or edit query; use `@ParameterName` placeholders (never concatenate user input into SQL).
2. **Parameters** — types: text, number, Jalali date, lookup, select, etc.
   - **اختیاری** checkbox: when unchecked, the parameter is **required** in the report viewer (red `*`).
3. **Datasets** (optional) — multiple SQL datasets for complex reports.
4. **Layout / embeds** (optional) — sections and sub-reports.
5. **Columns** — auto-detect from a test query or define manually.
   - Per column: **ثابت** (pin), **تراز**, **مرتب‌سازی اولیه**, **مخفی**
   - **نمایش جدول**: تراکم (معمولی/فشرده), اندازه صفحه, ثابت کردن ستون اول, نوار ابزار
6. **Charts** (optional) — ECharts bindings.
7. **Test** — run with sample parameters.
8. **Publish** — choose **module** and optional **folder**.

### Origin badges (admin only)

On `/admin/reports`, each row may show a badge:

| Badge | Meaning |
| ----- | ------- |
| *(none)* | Created in Studio (`sourceType=studio`) |
| **بسته** | Imported from `.insight-report.json` |
| **RDL** | Converted from a legacy RDL file |

In Studio edit mode, RDL-sourced reports show a **منبع RDL** link back to the original upload.

### Grid best practices

See [Report grid guide](./report-grid.md) for end-user toolbar help.

| Tip | Why |
| --- | --- |
| Set `type: number` for amounts/quantities | Persian number formatting + alignment |
| Pin supplier/name column on wide reports | Easier horizontal scroll |
| Use **فشرده** density for 500+ rows | More rows visible per page |
| Excel for archives; CSV for quick filtered export | Excel = server full export; CSV = toolbar filtered view |

---

## Modules & folders

Path: `/modules`

- **Module** — top-level menu group (slug used in ACL and report metadata).
- **Folder** — optional nesting under a module.
- **Move report** — change module/folder without reopening Studio.

ACL is granted at **module** level on `/access`; report-level grants still work for fine control.

---

## Access control

Path: `/access`

1. **Sync users** — pull user list from Rahkaran (requires `RAHKARAN_DB_*` env).
2. **Set password** — app passwords are bcrypt-hashed in the **Insight** database (not Rahkaran hashes).
3. **Grant access** — tick modules and/or individual reports per user.

API alternative: `POST /api/admin/sync-users` (admin session; optional header `x-admin-secret` if `ADMIN_SYNC_SECRET` is set).

---

## Branding

Path: `/settings` (admin only)

- Company name (Persian / English), product title, support contacts
- Logo, favicon, primary and accent colors
- Uploaded files live in `public/uploads/branding/` — back up this folder on deploy

---

## Export a report (backup / transfer)

In Studio edit toolbar: **صادر کردن بسته**.

Or: `GET /api/admin/reports/{slug}/package`

See [Report packages](./report-packages.md) for format details.

---

## Important rules

- Rahkaran / ERP database is **read-only** from the portal.
- All report SQL must use **bound parameters** (`@name`), not string building.
- After schema upgrades, run `npx prisma db push` on the app database.

---

## Related guides

- [RDL migration](./rdl-migration.md) — bulk legacy cutover
- [Report packages](./report-packages.md) — interchange format
- [Deploy & operations](./deploy-and-ops.md) — server install and updates
