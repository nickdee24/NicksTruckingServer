# Starts everything: the dedicated servers, the hub and the launcher.
#   start-all.ps1              servers + hub + launcher
#   start-all.ps1 -NoServers   just hub + launcher
param([switch]$NoServers)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

if (-not $NoServers) {
    & "$root\server\scripts\setup-server.ps1" | Out-Null
    & "$root\server\scripts\start-server.ps1"
}

$hubUp = $false
try { $hubUp = (Invoke-WebRequest http://localhost:7420/api/server -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200 } catch {}
if ($hubUp) {
    Write-Host 'Hub already running'
} else {
    if (-not (Test-Path "$root\hub\node_modules")) { Push-Location "$root\hub"; npm install --no-fund --no-audit; Pop-Location }
    Start-Process node -ArgumentList "`"$root\hub\src\server.js`"" -WorkingDirectory "$root\hub" -WindowStyle Minimized
    Write-Host 'Hub starting on http://localhost:7420'
}

if (-not (Test-Path "$root\launcher\node_modules\electron\dist\electron.exe")) {
    Push-Location "$root\launcher"; npm install --no-fund --no-audit; npm rebuild electron; Pop-Location
}
Start-Process "$root\launcher\node_modules\electron\dist\electron.exe" -ArgumentList "`"$root\launcher`"" -WorkingDirectory "$root\launcher"
Write-Host 'Launcher opening'
