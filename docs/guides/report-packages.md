# Report packages guide

Transfer reports between Insight Portal installations or keep offline backups.

---

## Format

**Extension:** `.insight-report.json`  
**MIME:** `application/json`

| Field | Description |
| ----- | ----------- |
| `format` | Always `insight-portal-report` |
| `formatVersion` | Currently `1` |
| `exportedAt` | ISO timestamp |
| `exportNote` | Optional note |
| `report.definition` | Full report definition (parameters, columns, charts, datasets, layout, embeds) |
| `report.sqlText` | Inline SQL text |
| `report.placement` | Optional `{ moduleId, folderId }` |
| `report.publishedVersion` | Optional version number |

Schema: `src/types/report-package.ts`

---

## Export

### UI

1. Open report in Studio: `/admin/reports/{slug}/edit`
2. Click **صادر کردن بسته** in the toolbar
3. Browser downloads `{slug}.insight-report.json`

### API

```http
GET /api/admin/reports/{slug}/package
```

Requires admin session. Returns pretty-printed JSON with `Content-Disposition` attachment.

---

## Import

### UI

**Single or multiple files:**

- **Create hub:** `/admin/reports/new` → scroll to **وارد کردن بسته**
- **Studio index:** `/admin/reports` → import panel at bottom

Options:

| Setting | Values |
| ------- | ------ |
| **ماژول مقصد** | Target module slug |
| **اگر شناسه تکراری بود** | نام جدید بساز (rename) · جایگزین کن (replace) · رد کن (skip) |

After import, `sourceType` is set to **`package`** and `sourceRef` stores the filename note.

### API

**Single file (multipart):**

```http
POST /api/admin/reports/import
Content-Type: multipart/form-data

file: <.insight-report.json>
moduleId: financial
conflict: rename|replace|skip
publish: true|false
folderId: (optional)
```

**Multiple files:**

```http
POST /api/admin/reports/import
Content-Type: multipart/form-data

files[]: <file1>
files[]: <file2>
moduleId: financial
conflict: rename
```

Response (batch):

```json
{
  "ok": true,
  "total": 2,
  "succeeded": 2,
  "skipped": 0,
  "failed": 0,
  "results": [
    { "filename": "a.insight-report.json", "ok": true, "slug": "a", "version": 1 }
  ]
}
```

**JSON body (single package object):**

```http
POST /api/admin/reports/import
Content-Type: application/json

{
  "package": { ... },
  "conflict": "rename",
  "moduleId": "financial",
  "publish": true
}
```

---

## Typical use cases

| Scenario | Steps |
| -------- | ----- |
| **Backup** | Export critical reports after publish; store in git or file share |
| **Dev → prod** | Export on dev; import on prod with `conflict=skip` or `rename` |
| **Clone install** | Export all from source; batch import on new server |
| **After RDL convert** | Export cleaned report once SQL is fixed; redeploy elsewhere without RDL |

---

## Conflict handling

| Mode | Behavior |
| ---- | -------- |
| `rename` (default) | If slug exists, create `slug-2`, `slug-3`, … |
| `replace` | Overwrite existing report definition |
| `skip` | Leave existing; return `skipped: true` |

---

## Placement

If the package includes `report.placement`, import uses that module/folder unless overridden by form `moduleId` / `folderId`.

Ensure the **module exists** on the target server (`/modules`) or import will create it via `ensureModuleBySlug`.

---

## Not included in packages

- RDL source files (use [RDL migration](./rdl-migration.md) separately)
- User ACL grants (re-grant on `/access`)
- Branding / `AppSettings`
- Lookup catalog data (only references in parameters)

---

## Related

- [Admin guide](./admin-guide.md)
- [RDL migration](./rdl-migration.md)
- [Deploy & operations](./deploy-and-ops.md)
