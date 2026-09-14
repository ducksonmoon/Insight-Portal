# Deploying to a Windows Server via GitHub Actions

## Why a self-hosted runner, not GitHub's own

Rahkaran (`RAHKARAN_DB_SERVER`) and the app's own SQL Server (`DATABASE_URL`)
both sit on private IPs inside the customer's network — this repo's own dev
worktrees connect to `192.168.2.10`. A GitHub-hosted runner lives in GitHub's
cloud and has no route to that address, full stop. There is no workflow
syntax that fixes this — the build has to happen on a machine that is
already inside that network.

The practical answer is a **self-hosted GitHub Actions runner installed on
the Windows Server itself**. It's an outbound-only agent: it polls GitHub for
jobs over HTTPS, so nothing needs to be opened inbound on the server or the
firewall. Once it's registered, `deploy-windows.yml` runs exactly the same
build the runner would run locally, just triggered by a push to `main`.

```
┌─────────────────────┐        outbound HTTPS only        ┌──────────────────────────────────────────────┐
│   GitHub (cloud)     │ ◄───────────────────────────────  │  Windows Server (customer's private network)  │
│                      │                                    │                                                │
│  Actions queues a    │                                    │  ┌──────────────┐   ┌────────────────────┐   │
│  "deploy" job        │ ─── runner polls, picks it up ──►  │  │ GH Actions   │──►│ npm ci / build /   │   │
│                      │                                    │  │ runner (svc) │   │ prisma db push      │   │
└─────────────────────┘                                    │  └──────────────┘   └──────────┬──────────┘   │
                                                              │                                │              │
                                                              │  ┌──────────────┐              ▼              │
                                                              │  │ IIS (:443)   │──proxy──►┌──────────────┐  │
                                                              │  │ reverse proxy│          │ InsightPortal │  │
                                                              │  └──────────────┘          │ (NSSM service,│  │
                                                              │                              │  next start)  │  │
                                                              │                              └──────┬───────┘  │
                                                              │                                       │          │
                                                              │            ┌──────────────────────────┼───┐      │
                                                              │            ▼                          ▼   │      │
                                                              │   Rahkaran SQL Server         App's own DB │      │
                                                              │   192.168.2.10 (read-only)     (Prisma)    │      │
                                                              └─────────────────────────────────────────────┘
```

## One-time server setup

1. **Check what's already there** — run, as Administrator:
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\windows-deploy\check-readiness.ps1 -RahkaranHost 192.168.2.10
   ```
   It's read-only; it just reports what's missing. Install whatever it flags:
   Node.js 20 LTS, IIS (`Install-WindowsFeature Web-Server
   -IncludeManagementTools`), the IIS **URL Rewrite** and **Application
   Request Routing (ARR)** modules, [NSSM](https://nssm.cc/download), and
   `git`.

2. **Clone and build once by hand** (the workflow only re-runs this later):
   ```powershell
   git clone https://github.com/ducksonmoon/Insight-Portal.git C:\apps\insight-portal
   cd C:\apps\insight-portal
   copy .env.example .env
   notepad .env   # fill in RAHKARAN_DB_*, DATABASE_URL, AUTH_SECRET, NEXTAUTH_URL, etc.
   npm ci
   npm run build
   npx prisma db push
   ```
   `.env` lives in this directory outside of git (it's gitignored) and stays
   there permanently — the workflow's `checkout` step never touches it
   (`clean: false`), and neither `npm run build` nor the running app needs
   any GitHub secret to find it: Next.js and Prisma both read `.env`
   automatically from the current directory.

3. **Register the Windows Service + IIS reverse proxy**:
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\windows-deploy\setup-service.ps1 `
       -DeployPath "C:\apps\insight-portal" `
       -SiteHostName "insight-portal.internal" `
       -AppPort 3000
   ```
   This wraps `npm start` (→ `next start`, serving the build from step 2) as
   an auto-restarting Windows Service named `InsightPortal` via NSSM, and
   creates an IIS site that reverse-proxies `insight-portal.internal` to
   `localhost:3000`. If IIS returns 502s afterward, open IIS Manager → the
   server node → **Application Request Routing Cache → Server Proxy
   Settings → Enable proxy** — that one server-wide toggle can't be set
   reliably from a script across IIS versions. Add a TLS binding (443 +
   certificate) once you have one for the hostname; the script only sets up
   port 80.

4. **Register the GitHub Actions runner** on the same box: repo → Settings →
   Actions → Runners → New self-hosted runner → follow GitHub's own
   PowerShell snippet (download, `config.cmd --url ... --token ...`, then
   `.\svc install` + `.\svc start` so it survives reboots and runs
   unattended). Give it the labels the workflow expects:
   `self-hosted, windows, insight-portal` (the third is a repo-specific
   label — useful the day this account runs more than one Windows deploy
   target).

## What the workflow does on every push to `main`

`.github/workflows/deploy-windows.yml`: checkout (without touching `.env`) →
`npm ci` → `npm run build` → `npx prisma db push` (fails loudly rather than
applying anything destructive — no `--accept-data-loss`) → `npm test` →
`Restart-Service InsightPortal` → poll `/api/health` until it responds `200`
or the job fails. No GitHub secrets are involved — every credential the app
needs is already in the server's own `.env`.

## Operating it afterward

| Task | Command |
| --- | --- |
| Check the app is up | `Get-Service InsightPortal` |
| Tail logs | `Get-Content C:\apps\insight-portal\logs\service-out.log -Tail 50 -Wait` |
| Manual restart | `Restart-Service InsightPortal` |
| Trigger a deploy without a push | repo → Actions → "Deploy to Windows Server" → Run workflow |
| Runner went offline | repo → Settings → Actions → Runners shows its status; on the server, `Get-Service actions.runner.*` |
| Roll back | `git checkout <previous-sha>` in the deploy directory, then re-run `npm ci && npm run build && npx prisma db push`, then `Restart-Service InsightPortal` — or just re-run the workflow from an earlier successful commit via `workflow_dispatch` after reverting `main` |

## Open questions this doc doesn't guess at

Same spirit as the rest of this repo's docs — these are for whoever runs the
real server to decide, not for a script to assume:

- **TLS certificate** for `insight-portal.internal` (or whatever hostname is
  chosen) — internal CA, public CA, or self-signed for now?
- **Backup strategy** for the app's own SQL Server database (Rahkaran itself
  is read-only from this app and presumably already backed up separately).
- **Who else needs runner access** — the runner executes whatever a workflow
  file says, with whatever permissions the service account running it has;
  restrict who can merge to `main` accordingly.
