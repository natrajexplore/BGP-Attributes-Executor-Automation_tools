<#
  One-time setup on your Windows PC so that "SSH session" on the dashboard opens a dedicated PuTTY window per router.

    powershell -ExecutionPolicy Bypass -File scripts\putty-setup.ps1                    install
    powershell -ExecutionPolicy Bypass -File scripts\putty-setup.ps1 -DryRun            show what it would do, change nothing
    powershell -ExecutionPolicy Bypass -File scripts\putty-setup.ps1 -Uninstall         remove everything it added

  What it adds (your Windows user only, HKCU, no administrator rights):
    1. One saved PuTTY session per router of every lab, named "BGP <lab> <router>", user "lab". PuTTY reaches the router through the
       EVE-NG VM with the Windows OpenSSH client (ssh.exe -W), because the router addresses only exist inside the VM.
    2. A link handler "bgpputty:" that the dashboard's "SSH session" button uses. It starts putty.exe -load "<that session>".
  The password is not stored: PuTTY asks for it (see the Credentials tab of the dashboard).
  The list of routers comes from the dashboard (GET /api/credentials), so run this again after labs are added.
#>
param(
    [string]$Server = "http://192.168.186.128:8000",
    [string]$PuttyPath = "",
    [switch]$Uninstall,
    [switch]$DryRun
)
$ErrorActionPreference = "Stop"
$sessions = "HKCU:\Software\SimonTatham\PuTTY\Sessions"
$proto = "HKCU:\Software\Classes\bgpputty"

function Enc([string]$name) { $name -replace ' ', '%20' }      # PuTTY stores spaces of a session name as %20

if ($Uninstall) {
    $n = 0
    if (Test-Path $sessions) {
        Get-ChildItem $sessions | Where-Object { $_.PSChildName -like "BGP%20*" } | ForEach-Object {
            if (-not $DryRun) { Remove-Item -LiteralPath $_.PSPath -Recurse -Force }
            $n++
        }
    }
    if (Test-Path $proto) { if (-not $DryRun) { Remove-Item -LiteralPath $proto -Recurse -Force }; Write-Host "removed the bgpputty: link handler" }
    $tail = if ($DryRun) { " (dry run: nothing changed)" } else { "" }
    Write-Host "removed $n PuTTY sessions$tail"
    return
}

if (-not $PuttyPath) {
    foreach ($c in @("$env:ProgramFiles\PuTTY\putty.exe", "${env:ProgramFiles(x86)}\PuTTY\putty.exe", "$env:LOCALAPPDATA\Programs\PuTTY\putty.exe")) {
        if (Test-Path $c) { $PuttyPath = $c; break }
    }
}
if (-not $PuttyPath -or -not (Test-Path $PuttyPath)) { throw "putty.exe not found. Install PuTTY or pass -PuttyPath <full path>." }
$ssh = Join-Path $env:SystemRoot "System32\OpenSSH\ssh.exe"
if (-not (Test-Path $ssh)) { throw "The Windows OpenSSH client was not found at $ssh (Settings > Optional features > OpenSSH Client)." }
# A 32-bit PuTTY (Program Files (x86)) sees C:\Windows\System32 as SysWOW64, where ssh.exe does not exist: it must use "Sysnative".
if ([Environment]::Is64BitOperatingSystem -and $PuttyPath -like "*(x86)*") { $ssh = Join-Path $env:SystemRoot "Sysnative\OpenSSH\ssh.exe" }
$sshCmd = $ssh.Replace('\', '\\')      # PuTTY reads a doubled backslash in a proxy command as one backslash (and \n, \t as control characters)
$launcher = Join-Path $PSScriptRoot "putty-launch.ps1"
if (-not (Test-Path $launcher)) { throw "putty-launch.ps1 must be next to this script." }
$vm = ([Uri]$Server).Host

$labs = (Invoke-RestMethod -Uri "$Server/api/credentials" -TimeoutSec 20).labs
Write-Host "putty:    $PuttyPath"
Write-Host "via VM:   root@$vm (key login with $ssh)"
Write-Host "routers:  $(($labs | ForEach-Object { $_.routers.Count } | Measure-Object -Sum).Sum) in $($labs.Count) labs"

$count = 0
foreach ($lab in $labs) {
    foreach ($r in $lab.routers) {
        $name = "BGP $($lab.id) $($r.name)"
        $count++
        if ($DryRun) { continue }
        $key = Join-Path $sessions (Enc $name)
        New-Item -Path $key -Force | Out-Null
        $str = @{
            HostName = $r.mgmt_ip; Protocol = "ssh"; UserName = $r.username
            ProxyTelnetCommand = "$sshCmd -W %host:%port root@$vm"
            KEX = "dh-group14-sha1,dh-group1-sha1,WARN"; Cipher = "aes,3des,WARN"; HostKey = "rsa,WARN"      # what the routers' IOS 15.2 SSH server offers
            WinTitle = "$($lab.id) $($r.name)  $($r.mgmt_ip)"
        }
        foreach ($k in $str.Keys) { Set-ItemProperty -LiteralPath $key -Name $k -Value $str[$k] -Type String }
        Set-ItemProperty -LiteralPath $key -Name PortNumber -Value 22 -Type DWord
        Set-ItemProperty -LiteralPath $key -Name ProxyMethod -Value 5 -Type DWord        # 5 = run a local command
        Set-ItemProperty -LiteralPath $key -Name ProxyLogToTerminal -Value 2 -Type DWord  # show proxy errors in the window until the session starts
        Set-ItemProperty -LiteralPath $key -Name ScrollbackLines -Value 10000 -Type DWord
    }
}

if (-not $DryRun) {
    New-Item -Path $proto -Force | Out-Null
    Set-Item -LiteralPath $proto -Value "URL:BGP lab PuTTY session"
    Set-ItemProperty -LiteralPath $proto -Name "URL Protocol" -Value "" -Type String
    Set-ItemProperty -LiteralPath $proto -Name "PuttyPath" -Value $PuttyPath -Type String
    New-Item -Path "$proto\shell\open\command" -Force | Out-Null
    Set-Item -LiteralPath "$proto\shell\open\command" -Value "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$launcher`" `"%1`""
}
if ($DryRun) { Write-Host "dry run: would create $count sessions and the bgpputty: link handler; nothing changed." }
else { Write-Host "done: $count PuTTY sessions and the bgpputty: link handler. Click 'SSH session' on the dashboard (the browser asks once to allow the link)." }
