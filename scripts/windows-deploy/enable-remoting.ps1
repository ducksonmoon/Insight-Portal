<#
.SYNOPSIS
    One-time setup: enables PowerShell Remoting (WinRM) on the Windows Server
    so operators can manage Insight Portal from their own Windows machine with
    Enter-PSSession / Invoke-Command instead of RDP. Run this ONCE per server,
    by hand, as Administrator.

    By default it creates an HTTPS listener (port 5986) with a self-signed
    certificate, and opens the firewall only to the addresses in
    -AllowedRemoteAddress. Plain HTTP (5985) is left untouched - on a
    non-domain (workgroup) server, credentials over HTTP rely on
    TrustedHosts and NTLM, which is weaker than HTTPS.

    This script does NOT run on the GitHub Actions runner. Read every step
    before running; it changes WinRM, certificate and firewall configuration
    on this machine.

.USAGE
    powershell -ExecutionPolicy Bypass -File enable-remoting.ps1 `
        -HostName "insight-portal.internal" `
        -AllowedRemoteAddress "10.0.0.0/24"

    Then, from the operator's machine, use connect-remote.ps1.
#>

param(
    # DNS name (or IP) operators will use to reach this server. Goes into the
    # certificate's subject, so it must match what the client connects to.
    [string]$HostName = $env:COMPUTERNAME,

    # Who may reach WinRM over HTTPS. Comma-separated IPs/CIDRs, or "Any".
    # Keep this as narrow as possible - "Any" exposes WinRM to the whole network.
    [Parameter(Mandatory = $true)]
    [string[]]$AllowedRemoteAddress,

    [int]$Port = 5986,

    [int]$CertValidYears = 3
)

$ErrorActionPreference = "Stop"

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run this script from an elevated (Administrator) PowerShell."
}

Write-Host "== Enabling PowerShell Remoting ==" -ForegroundColor Cyan
# -SkipNetworkProfileCheck: Enable-PSRemoting refuses to run while any NIC is
# on a "Public" network profile. The firewall rule below is what actually
# restricts access, so the profile check adds nothing here.
Enable-PSRemoting -Force -SkipNetworkProfileCheck | Out-Null
Set-Service -Name WinRM -StartupType Automatic

Write-Host "== Certificate for $HostName ==" -ForegroundColor Cyan
$cert = Get-ChildItem Cert:\LocalMachine\My |
    Where-Object { $_.Subject -eq "CN=$HostName" -and $_.NotAfter -gt (Get-Date).AddDays(30) } |
    Sort-Object NotAfter -Descending |
    Select-Object -First 1

if ($cert) {
    Write-Host "Reusing existing certificate $($cert.Thumbprint) (expires $($cert.NotAfter))."
} else {
    $cert = New-SelfSignedCertificate `
        -DnsName $HostName `
        -CertStoreLocation Cert:\LocalMachine\My `
        -KeyExportPolicy NonExportable `
        -NotAfter (Get-Date).AddYears($CertValidYears)
    Write-Host "Created self-signed certificate $($cert.Thumbprint)."
}

Write-Host "== HTTPS listener on port $Port ==" -ForegroundColor Cyan
$existing = Get-ChildItem WSMan:\localhost\Listener |
    Where-Object { $_.Keys -contains "Transport=HTTPS" }
foreach ($listener in $existing) {
    Write-Host "Removing existing HTTPS listener $($listener.Name)." -ForegroundColor Yellow
    Remove-Item -Path "WSMan:\localhost\Listener\$($listener.Name)" -Recurse -Force
}
New-Item -Path WSMan:\localhost\Listener `
    -Transport HTTPS `
    -Address * `
    -CertificateThumbPrint $cert.Thumbprint `
    -HostName $HostName `
    -Port $Port `
    -Force | Out-Null

# Basic auth sends the password inside the (encrypted) HTTPS channel; keep it
# off so only Negotiate/Kerberos/NTLM are accepted.
Set-Item WSMan:\localhost\Service\Auth\Basic -Value $false
Set-Item WSMan:\localhost\Service\AllowUnencrypted -Value $false

Write-Host "== Firewall ==" -ForegroundColor Cyan
$ruleName = "WinRM HTTPS (Insight Portal ops)"
Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule `
    -DisplayName $ruleName `
    -Direction Inbound `
    -Protocol TCP `
    -LocalPort $Port `
    -RemoteAddress $AllowedRemoteAddress `
    -Action Allow `
    -Profile Any | Out-Null
Write-Host "Allowed TCP $Port from: $($AllowedRemoteAddress -join ', ')"

Restart-Service WinRM

Write-Host ""
Write-Host "Done. Listener:" -ForegroundColor Green
Get-ChildItem WSMan:\localhost\Listener | ForEach-Object { "  $($_.Keys -join ' ')" }
Write-Host ""
Write-Host "Certificate thumbprint (give this to operators so they can verify it): $($cert.Thumbprint)" -ForegroundColor Green
Write-Host "From an operator machine:"
Write-Host "  .\scripts\windows-deploy\connect-remote.ps1 -ComputerName $HostName"
