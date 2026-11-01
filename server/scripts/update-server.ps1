# Installs or updates the ETS2 dedicated server (Steam app 1948160) with SteamCMD.
# All servers share this one install.
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\common.ps1"
$steamcmd = Join-Path $Cfg.dataRoot 'steamcmd\steamcmd.exe'
& $steamcmd +force_install_dir (Join-Path $Cfg.dataRoot 'ets2ds') +login anonymous +app_update 1948160 validate +quit
