# Installs or updates the ETS2 dedicated server (Steam app 1948160) with SteamCMD.
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$cfg = Get-Content "$repo\server\config\server.json" -Raw | ConvertFrom-Json
$steamcmd = Join-Path $cfg.dataRoot 'steamcmd\steamcmd.exe'
& $steamcmd +force_install_dir (Join-Path $cfg.dataRoot 'ets2ds') +login anonymous +app_update 1948160 validate +quit
