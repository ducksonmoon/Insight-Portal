# Deploy & operations guide

Install, update, and run Insight Portal on a server.

---

## Requirements

| Component | Notes |
| --------- | ----- |
| Node.js 20+ | LTS recommended |
| SQL Server | App DB (Prisma) + read-only Rahkaran/ERP connection |
| OS | Windows Server or Linux |

```sql
CREATE DATABASE InsightPortal;
```

App DB user needs DDL on first install (`db_owner` is fine; reduce later). Rahkaran user: **read-only** only.

---

## Environment variables

Copy `.env.example` → `.env.local` (dev) or `.env` (production).

### Required

```env
DATABASE_URL="sqlserver://HOST:1433;database=InsightPortal;user=USER;password=PASS;encrypt=true;trustServerCertificate=true"
AUTH_SECRET=<long-random-hex>
NEXTAUTH_URL=https://reports.your-company.com
```

Generate secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Rahkaran (for live reports)

```env
RAHKARAN_DB_SERVER=...
RAHKARAN_DB_NAME=...
RAHKARAN_DB_USER=...
RAHKARAN_DB_PASSWORD=...
RAHKARAN_DB_ENCRYPT=true
RAHKARAN_DB_TRUST_SERVER_CERTIFICATE=true
```

### Optional

```env
ADMIN_SYNC_SECRET=
NEXT_PUBLIC_APP_NAME=Insight Portal
SEED_ADMIN_USER=admin          # db:seed only
SEED_ADMIN_PASSWORD=admin123
```

---

## Fresh install

```bash
cd /path/to/Insight-Portal
npm ci                    # or npm install
npx prisma db push
npm run build
npm run start
```

Open `NEXTAUTH_URL` → `/setup` (first admin) or `/login`.

Optional sample data: `npm run db:seed`

---

## Production process manager

### PM2

```bash
npm install -g pm2
pm2 start npm --name insight-portal -- start
pm2 save && pm2 startup
```

### Windows service (NSSM)

Point service at `npm start` with working directory = project folder; set env vars in NSSM.

### HTTPS reverse proxy

Proxy to `http://127.0.0.1:3000`. Set `client_max_body_size` ≥ 10m for logo uploads.

**Critical:** `NEXTAUTH_URL` must match the public URL exactly (`https://` in production).

---

## Updating

```bash
pm2 stop insight-portal   # or stop Windows service

git pull                  # or copy release
npm ci
npx prisma db push        # apply new columns/tables
npm run build

pm2 restart insight-portal
```

### Back up before update

- SQL Server database `InsightPortal`
- `public/uploads/branding/`
- `data/rdl/` (if you rely on local RDL copies)

### Schema changes (recent)

After the migration pipeline release, `prisma db push` adds:

- `Report.sourceType`, `Report.sourceRef`
- `RdlReport.convertStatus`, `RdlReport.convertError`

---

## Health check

```bash
curl http://localhost:3000/api/health
```

Fields include `setupComplete`, `rahkaranConfigured`, `company`, `app`.

---

## npm scripts reference

| Script | Purpose |
| ------ | ------- |
| `npm run dev` | Development server |
| `npm run build` | `prisma generate` + `next build` |
| `npm run start` | Production server |
| `npx prisma db push` | Sync schema to SQL Server |
| `npm run db:seed` | Sample modules/reports |
| `npm run report:scaffold -- --id …` | New report from `.sql` file |
| `npm run rdl:import -- --dir …` | Bulk RDL import — see [RDL migration](./rdl-migration.md) |

---

## Troubleshooting

| Problem | What to check |
| ------- | ------------- |
| Always redirected to `/setup` | `DATABASE_URL`; `db push`; no admin user |
| Login fails | Password; user inactive; run setup/seed |
| Reports DB error | `RAHKARAN_DB_*`; firewall; read-only login |
| Prisma connection | Encrypt / `trustServerCertificate`; SQL port 1433 |
| Logo 404 after deploy | Restore `public/uploads/branding` |
| Auth callback behind proxy | `NEXTAUTH_URL` = public HTTPS URL |
| `prisma generate` EPERM (Windows) | Stop dev server locking `query_engine-windows.dll.node` |
| RDL upload 400 | Extension `.rdl`; max 15 MB |
| Batch import slow | Use CLI for 1000+ files; browser for ~50 |
| `data/rdl` missing | Created on first upload; ensure write permission |

**Logs:** dev = terminal; prod = `pm2 logs insight-portal` or service stdout.

---

## Security checklist

- [ ] Strong unique `AUTH_SECRET`
- [ ] Change default admin password after install
- [ ] Rahkaran login is read-only
- [ ] Never commit `.env.local` / `.env`
- [ ] HTTPS in production
- [ ] Optional: `ADMIN_SYNC_SECRET` for sync-users
- [ ] Restrict network access (VPN/firewall) if required

---

## Related

- [Admin guide](./admin-guide.md)
- [RDL migration](./rdl-migration.md)
- [Report packages](./report-packages.md)
