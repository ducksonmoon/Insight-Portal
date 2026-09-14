<#
.SYNOPSIS
    Read-only readiness check for deploying Insight Portal to this Windows
    Server. Makes no changes — run this first to see what's already here
    and what setup-service.ps1 (or manual steps) still needs to do.

.USAGE
    Run as Administrator, from any directory:
        powershell -ExecutionPolicy Bypass -File check-readiness.ps1

    Optionally pass the Rahkaran SQL Server host to test reachability:
        powershell -ExecutionPolicy Bypass -File check-readiness.ps1 -RahkaranHost 192.168.2.10 -RahkaranPort 1433
#>

param(
    [string]$RahkaranHost,
    [int]$RahkaranPort = 1433
)

function Write-Check($label, $ok, $detail) {
    $status = if ($ok) { "[ OK ]" } else { "[MISSING]" }
    $color = if ($ok) { "Green" } else { "Yellow" }
    Write-Host "$status $label" -ForegroundColor $color
    if ($detail) { Write-Host "         $detail" -ForegroundColor DarkGray }
}

Write-Host ""
Write-Host "== Insight Portal — Windows Server readiness check ==" -ForegroundColor Cyan
Write-Host ""

# --- Administrator check --------------------------------------------------
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
Write-Check "Running as Administrator" $isAdmin "Re-run elevated if not — several checks below need it."

# --- Node.js ---------------------------------------------------------------
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
    $nodeVersion = (node --version)
    $major = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
    Write-Check "Node.js installed" $true "$nodeVersion at $($node.Source)"
    Write-Check "Node.js >= 20" ($major -ge 20) "package.json / Next.js expect Node 20 LTS or newer."
} else {
    Write-Check "Node.js installed" $false "Install the current LTS from https://nodejs.org/ (or 'winget install OpenJS.NodeJS.LTS')."
}

# --- npm ---------------------------------------------------------------
$npm = Get-Command npm -ErrorAction SilentlyContinue
Write-Check "npm available" ([bool]$npm) $(if ($npm) { (npm --version) } else { "Comes with the Node.js installer." })

# --- IIS ---------------------------------------------------------------
$iisFeature = Get-WindowsFeature -Name Web-Server -ErrorAction SilentlyContinue
$iisInstalled = $iisFeature -and $iisFeature.InstallState -eq "Installed"
Write-Check "IIS (Web-Server role)" $iisInstalled "Install-WindowsFeature Web-Server -IncludeManagementTools"

$rewriteInstalled = Test-Path "HKLM:\SOFTWARE\Microsoft\IIS Extensions\URL Rewrite"
Write-Check "IIS URL Rewrite module" $rewriteInstalled "Download: https://www.iis.net/downloads/microsoft/url-rewrite"

$arrInstalled = Test-Path "HKLM:\SOFTWARE\Microsoft\IIS Extensions\Application Request Routing"
Write-Check "IIS Application Request Routing (ARR)" $arrInstalled "Download: https://www.iis.net/downloads/microsoft/application-request-routing"

# --- NSSM ---------------------------------------------------------------
$nssm = Get-Command nssm -ErrorAction SilentlyContinue
Write-Check "NSSM (Windows service wrapper)" ([bool]$nssm) "Download: https://nssm.cc/download — used to run 'npm start' as a service."

# --- Existing InsightPortal service ---------------------------------------
$svc = Get-Service -Name "InsightPortal" -ErrorAction SilentlyContinue
Write-Check "InsightPortal Windows Service registered" ([bool]$svc) $(if ($svc) { "Status: $($svc.Status)" } else { "Created by setup-service.ps1." })

# --- GitHub Actions self-hosted runner -------------------------------------
$runnerSvc = Get-Service -Name "actions.runner.*" -ErrorAction SilentlyContinue
Write-Check "GitHub Actions runner service registered" ([bool]$runnerSvc) $(if ($runnerSvc) { "Status: $($runnerSvc.Status)" } else { "Register via github.com -> repo -> Settings -> Actions -> Runners -> New self-hosted runner." })

# --- Git ---------------------------------------------------------------
$git = Get-Command git -ErrorAction SilentlyContinue
Write-Check "git installed" ([bool]$git) "Required by the GitHub Actions runner to check out the repo."

# --- Network reachability ---------------------------------------------------
Write-Host ""
Write-Host "-- Network reachability --" -ForegroundColor Cyan

$githubReachable = Test-NetConnection -ComputerName "github.com" -Port 443 -WarningAction SilentlyContinue -InformationLevel Quiet
Write-Check "Outbound to github.com:443" $githubReachable "Needed for the runner to pick up jobs and for 'npm ci' if any packages aren't cached."

if ($RahkaranHost) {
    $rahkaranReachable = Test-NetConnection -ComputerName $RahkaranHost -Port $RahkaranPort -WarningAction SilentlyContinue -InformationLevel Quiet
    Write-Check "Rahkaran SQL Server ($RahkaranHost`:$RahkaranPort)" $rahkaranReachable "This must succeed from THIS box — the app connects to it directly at runtime."
} else {
    Write-Host "[ SKIP ] Rahkaran reachability — pass -RahkaranHost <ip> to check (see RAHKARAN_DB_SERVER in your .env)." -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "Done. Anything marked MISSING is covered in docs/deployment/windows-server.md." -ForegroundColor Cyan
Write-Host ""
