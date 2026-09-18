<#
.SYNOPSIS
    One-time setup: registers Insight Portal as a Windows Service (via NSSM)
    and configures an IIS reverse-proxy site in front of it. Run this ONCE
    per server, by hand, as Administrator, after check-readiness.ps1 shows
    Node.js/IIS/URL Rewrite/ARR/NSSM all present and a first
    `npm ci && npm run build` has already succeeded in $DeployPath.

    This script does NOT run on the GitHub Actions runner - deploy-windows.yml
    only restarts the service this script creates. Read every step before
    running; it changes IIS and service configuration on this machine.

.USAGE
    powershell -ExecutionPolicy Bypass -File setup-service.ps1 `
        -DeployPath "C:\apps\insight-portal" `
        -SiteHostName "insight-portal.internal" `
        -AppPort 3000
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$DeployPath,

    [Parameter(Mandatory = $true)]
    [string]$SiteHostName,

    [int]$AppPort = 3000,

    [string]$ServiceName = "InsightPortal",

    [string]$SiteName = "InsightPortal"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $DeployPath)) {
    throw "DeployPath '$DeployPath' does not exist. Clone the repo there and run 'npm ci && npm run build' first."
}
if (-not (Test-Path (Join-Path $DeployPath ".env"))) {
    throw ".env not found in $DeployPath. Create it first (copy .env.example and fill in real values) - the service reads it from this directory at startup."
}

$nssm = Get-Command nssm -ErrorAction SilentlyContinue
if (-not $nssm) {
    throw "nssm not found on PATH. Download from https://nssm.cc/download and add it to PATH first."
}

$npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npmCmd) {
    throw "npm.cmd not found on PATH. Ensure Node.js is installed and its install directory is on the System (not just user) PATH."
}
# Use the 8.3 short path (no spaces), not a quoted long path. A quoted
# argument here is built as one PowerShell string with an escaped embedded
# quote, but PowerShell's marshalling of that string into nssm.exe's native
# command line silently drops the embedded quotes -- confirmed via
# `nssm get InsightPortal AppParameters`, which came back as the UNQUOTED
# "C:\Program Files\nodejs\npm.cmd start", so cmd.exe ran "C:\Program" as
# the command and everything after as arguments ("'C:\Program' is not
# recognized ..." in the service's own error log, and a start/crash loop
# that LOOKS like an install/launch failure but is really the app never
# getting a chance to run). A short path never contains spaces, so there is
# no quoting -- and nothing for that marshalling step to lose.
$fso = New-Object -ComObject Scripting.FileSystemObject
$npmPath = $fso.GetFile($npmCmd.Source).ShortPath
if ($npmPath -match ' ') {
    throw "Could not get a space-free short path for '$($npmCmd.Source)' (got '$npmPath'). This usually means 8.3 short-name generation is disabled on this volume (check with 'fsutil 8dot3name query C:'). Re-install Node.js to a path with no spaces (e.g. C:\nodejs) as a workaround."
}
$cmdExe = Join-Path $env:SystemRoot "System32\cmd.exe"

Write-Host "== Registering '$ServiceName' as a Windows Service ==" -ForegroundColor Cyan

$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Service '$ServiceName' already exists - stopping and removing it first." -ForegroundColor Yellow
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    nssm remove $ServiceName confirm
}

# `npm start` runs `next start`, which serves the already-built .next/ in
# $DeployPath. NSSM restarts the process automatically if it crashes.
#
# The service binary MUST be a real executable, not npm.cmd directly: on
# PowerShell, plain `Get-Command npm` resolves to npm.ps1 ahead of npm.cmd
# (PowerShell prefers ExternalScript matches over Application matches for a
# bare name, regardless of $env:PATHEXT order) -- and a .ps1 can never be
# launched as a process by any Win32 CreateProcess-based launcher, including
# NSSM and the Service Control Manager itself. Pointing nssm at that path
# fails the instant the service tries to start, which is exactly
# Start-Service's "Failed to start service ... ServiceCommandException".
# Routing through cmd.exe /c avoids the whole .ps1-vs-.cmd resolution issue.
nssm install $ServiceName $cmdExe "/c $npmPath start"
nssm set $ServiceName AppDirectory $DeployPath
nssm set $ServiceName AppEnvironmentExtra "PORT=$AppPort" "NODE_ENV=production"
nssm set $ServiceName DisplayName "Insight Portal"
nssm set $ServiceName Description "Insight Portal - Next.js app (managed by NSSM, deployed via GitHub Actions)"
nssm set $ServiceName Start SERVICE_AUTO_START
nssm set $ServiceName AppStdout (Join-Path $DeployPath "logs\service-out.log")
nssm set $ServiceName AppStderr (Join-Path $DeployPath "logs\service-err.log")
nssm set $ServiceName AppRotateFiles 1
nssm set $ServiceName AppRotateBytes 10485760

New-Item -ItemType Directory -Force -Path (Join-Path $DeployPath "logs") | Out-Null

Start-Service -Name $ServiceName
Start-Sleep -Seconds 3
$status = (Get-Service -Name $ServiceName).Status
Write-Host "Service status: $status" -ForegroundColor $(if ($status -eq "Running") { "Green" } else { "Red" })

Write-Host ""
Write-Host "== Configuring IIS reverse proxy ('$SiteName' -> localhost:$AppPort) ==" -ForegroundColor Cyan

Import-Module WebAdministration

if (Get-Website -Name $SiteName -ErrorAction SilentlyContinue) {
    Write-Host "Site '$SiteName' already exists - leaving it as-is. Delete it first in IIS Manager to reconfigure." -ForegroundColor Yellow
} else {
    $sitePhysicalPath = Join-Path $DeployPath "iis-proxy"
    New-Item -ItemType Directory -Force -Path $sitePhysicalPath | Out-Null

    # ARR must have "Enable proxy" turned on once, server-wide, in
    # IIS Manager -> (server node) -> Application Request Routing Cache ->
    # Server Proxy Settings -> Enable proxy. This script can't toggle that
    # setting reliably across IIS versions - check it manually if the site
    # returns 502s after this runs.
    New-Website -Name $SiteName -PhysicalPath $sitePhysicalPath -HostHeader $SiteHostName -Port 80

    $webConfig = @"
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="ReverseProxyToNode" stopProcessing="true">
          <match url="(.*)" />
          <action type="Rewrite" url="http://localhost:$AppPort/{R:1}" />
        </rule>
      </rules>
    </rewrite>
  </system.webServer>
</configuration>
"@
    Set-Content -Path (Join-Path $sitePhysicalPath "web.config") -Value $webConfig -Encoding UTF8

    Write-Host "Site '$SiteName' created, bound to http://$SiteHostName -> http://localhost:$AppPort" -ForegroundColor Green
    Write-Host "Add TLS (443 binding + certificate) in IIS Manager once you have a certificate for $SiteHostName." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Done. Verify: Invoke-WebRequest http://$SiteHostName/api/health" -ForegroundColor Cyan
Write-Host "If ARR wasn't already enabled, see the comment above 'Enable proxy' in this script." -ForegroundColor Yellow
