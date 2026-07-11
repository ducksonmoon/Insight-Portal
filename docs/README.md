# Insight Portal — Documentation

Guides for admins, implementers, and migration from legacy Rahkaran / SSRS RDL.

| Guide | Audience | Topics |
| ----- | -------- | ------ |
| [Admin guide](./guides/admin-guide.md) | Portal admins | Modules, Studio, access, branding, day-to-day workflows |
| [RDL migration](./guides/rdl-migration.md) | Admins + implementers | Bulk import from disk, browser batch, convert, cutover |
| [Report packages](./guides/report-packages.md) | Admins | `.insight-report.json` export/import, transfer between servers |
| [Report grid](./guides/report-grid.md) | End users + admins | Toolbar, search, CSV vs Excel, pagination |
| [Deploy & operations](./guides/deploy-and-ops.md) | DevOps / IT | Install, update, PM2, HTTPS, troubleshooting |
| [UI patterns](./guides/ui-patterns.md) | Implementers | PageHeader, forms, surfaces, tokens |

**Main project README:** [../README.md](../README.md)

## Quick links (UI)

| Path | Purpose |
| ---- | ------- |
| `/setup` | First-time company + brand + admin wizard |
| `/login` | Sign in |
| `/reports` | End-user report catalog |
| `/modules` | Modules, folders, report placement |
| `/access` | User sync, passwords, ACL grants |
| `/settings` | Branding (admin) |
| `/admin/reports` | Report Studio index |
| `/admin/reports/new` | Create-report hub (Studio / package / RDL) |
| `/admin/rdl` | Legacy RDL upload, review, bulk convert |

## Architecture (one sentence)

**Insight SQL is the only runtime** — RDL and package files are admin-only import paths; they are converted or imported once, then edited and published in Studio.
