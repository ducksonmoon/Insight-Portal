<#
.SYNOPSIS
    Opens a remote PowerShell session to the Insight Portal server over
    WinRM/HTTPS (the listener created by enable-remoting.ps1). Run this on
    the operator's own Windows machine - no Administrator rights needed.

    With no -Command, drops you into an interactive session
    (Enter-PSSession). With -Command, runs that script block on the server
    and returns its output (Invoke-Command) - handy for one-liners like
    checking the service or tailing logs.

.USAGE
    # Interactive shell on the server
    .\connect-remote.ps1 -ComputerName "insight-portal.internal"

    # One-off command
    .\connect-remote.ps1 -ComputerName "insight-portal.internal" `
        -Command { Get-Service InsightPortal }

    # Server uses a self-signed cert the client doesn't trust yet
    .\connect-remote.ps1 -ComputerName "10.0.0.15" -SkipCertificateCheck
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$ComputerName,

    [int]$Port = 5986,

    # Prompted for if omitted. Use DOMAIN\user, or SERVERNAME\user for a
    # local account on a workgroup server.
    [System.Management.Automation.PSCredential]$Credential,

    [scriptblock]$Command,

    # Skips CA / hostname / revocation checks on the server's certificate.
    # Needed for the self-signed cert from enable-remoting.ps1 unless you've
    # imported it into this machine's Trusted Root store. The channel is
    # still encrypted, but you're no longer verifying *who* you're talking to.
    [switch]$SkipCertificateCheck
)

$ErrorActionPreference = "Stop"

if (-not $Credential) {
    $Credential = Get-Credential -Message "Credentials for $ComputerName"
}

$sessionOptions = if ($SkipCertificateCheck) {
    Write-Warning "Skipping certificate validation for $ComputerName."
    New-PSSessionOption -SkipCACheck -SkipCNCheck -SkipRevocationCheck
} else {
    New-PSSessionOption
}

$params = @{
    ComputerName  = $ComputerName
    Port          = $Port
    UseSSL        = $true
    Credential    = $Credential
    SessionOption = $sessionOptions
}

Write-Host "Checking ${ComputerName}:$Port is reachable..." -ForegroundColor Cyan
$tcp = Test-NetConnection -ComputerName $ComputerName -Port $Port -WarningAction SilentlyContinue
if (-not $tcp.TcpTestSucceeded) {
    throw "Can't reach ${ComputerName}:$Port. Check enable-remoting.ps1 ran on the server and its firewall rule allows your IP."
}

if ($Command) {
    Invoke-Command @params -ScriptBlock $Command
} else {
    Enter-PSSession @params
}
