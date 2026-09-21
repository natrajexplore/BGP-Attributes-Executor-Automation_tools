#Requires -RunAsAdministrator
<#
  Opens Windows Firewall for the BGP monitoring stack and recreates Kafka so it
  advertises the VMnet8 IP the EVE-NG VM can reach.

  Usage (elevated PowerShell, from the repo root):
    .\scripts\setup-windows.ps1                       # defaults: 192.168.186.0/24
    .\scripts\setup-windows.ps1 -EveSubnet 192.168.186.0/24 -Remove
#>
param(
    [string]$EveSubnet = "192.168.186.0/24",   # VMnet8 subnet; rules only allow this source
    [int[]]$Ports = @(9094, 3000, 9090, 8080), # Kafka external, Grafana, Prometheus, Kafka UI
    [switch]$Remove,                           # delete the rules instead of creating them
    [switch]$SkipKafka                         # firewall only, don't touch docker
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$prefix = "BGP-Monitor"

foreach ($p in $Ports) {
    $name = "$prefix TCP $p"
    Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    if ($Remove) { Write-Host "removed  $name"; continue }
    New-NetFirewallRule -DisplayName $name -Direction Inbound -Protocol TCP -LocalPort $p `
        -RemoteAddress $EveSubnet -Action Allow -Profile Any | Out-Null
    Write-Host "allowed  $name  from $EveSubnet"
}

if ($Remove -or $SkipKafka) { return }

# .env is read by docker compose for KAFKA_ADVERTISED_HOST - check without printing secrets
$envFile = Join-Path $repo ".env"
if (-not (Test-Path $envFile)) {
    Write-Warning ".env not found. Copy .env.example to .env first, then re-run."
    return
}
$adv = (Select-String -Path $envFile -Pattern '^KAFKA_ADVERTISED_HOST=(.+)$').Matches.Groups[1].Value
if (-not $adv) { Write-Warning "KAFKA_ADVERTISED_HOST missing in .env"; return }
Write-Host "Kafka will advertise $adv`:9094"

Push-Location $repo
try {
    docker compose -f docker-compose.monitoring.yml up -d --force-recreate kafka
    if ($LASTEXITCODE -ne 0) { throw "docker compose failed" }
    docker compose -f docker-compose.monitoring.yml up -d
} finally { Pop-Location }

Write-Host "`nDone. From the EVE VM verify:  nc -zv $adv 9094"
