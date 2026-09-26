<#
  Started by the bgpputty: link handler that putty-setup.ps1 registers. The dashboard's "SSH session" button opens
  bgpputty:<lab>/<router>, and this script starts the saved PuTTY session "BGP <lab> <router>" in its own window.
  Only a lab id and a router name are accepted, and only an existing saved session is loaded.
#>
param([string]$Url)
Add-Type -AssemblyName System.Windows.Forms
function Fail([string]$msg) { [System.Windows.Forms.MessageBox]::Show($msg, "BGP lab PuTTY") | Out-Null; exit 1 }

if ($Url -notmatch '^bgpputty:/{0,2}([A-Za-z0-9_]+)/([A-Za-z0-9_.-]+)/?$') { Fail "Not a valid session link: $Url" }
$name = "BGP $($Matches[1]) $($Matches[2])"
$key = "HKCU:\Software\SimonTatham\PuTTY\Sessions\" + ($name -replace ' ', '%20')
if (-not (Test-Path -LiteralPath $key)) { Fail "There is no PuTTY session '$name'. Run scripts\putty-setup.ps1 again (the lab may be new)." }
$putty = (Get-ItemProperty -LiteralPath "HKCU:\Software\Classes\bgpputty" -ErrorAction SilentlyContinue).PuttyPath
if (-not $putty -or -not (Test-Path $putty)) { Fail "putty.exe was not found. Run scripts\putty-setup.ps1 again." }
Start-Process -FilePath $putty -ArgumentList @("-load", "`"$name`"")      # the session name has spaces: quote it
