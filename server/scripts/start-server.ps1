# Starts the ETS2 dedicated server in its own window.
# -nosingle lets it run alongside the game on the same PC.
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$cfg = Get-Content "$repo\server\config\server.json" -Raw | ConvertFrom-Json
$exe = Join-Path $cfg.dataRoot 'ets2ds\bin\win_x64\eurotrucks2_server.exe'
$home_ = Join-Path $cfg.dataRoot 'home'
$serverDir = Join-Path $home_ 'Euro Truck Simulator 2'

if (-not (Test-Path $exe)) { throw "Dedicated server not installed at $exe. Run update-server.ps1 first." }
if (-not (Test-Path "$serverDir\server_packages.sii")) { throw "Server packages missing. Run setup-server.ps1 after exporting them in-game." }

Start-Process $exe -ArgumentList "-homedir `"$home_`"", '-nosingle' -WorkingDirectory (Split-Path $exe)
Write-Host "Server starting. Log: $serverDir\server.log.txt"
