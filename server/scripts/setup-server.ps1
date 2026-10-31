# Builds the dedicated server's home folder from server/config.
# Safe to re-run: it rewrites server_config.sii and re-copies server packages.
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$cfg = Get-Content "$repo\server\config\server.json" -Raw | ConvertFrom-Json
# The server is started with -homedir <dataRoot>\home and keeps its files in a
# "Euro Truck Simulator 2" folder inside it, just like the game does in Documents.
$home_ = Join-Path $cfg.dataRoot 'home\Euro Truck Simulator 2'
$gameDocs = [Environment]::ExpandEnvironmentVariables($cfg.gameDocs)
New-Item -ItemType Directory -Force $home_ | Out-Null

# Password lives outside the repo so it never gets committed.
$secretFile = Join-Path $cfg.dataRoot 'server_password.txt'
if (-not (Test-Path $secretFile)) {
    $chars = 'abcdefghjkmnpqrstuvwxyz23456789'.ToCharArray()
    -join (1..10 | ForEach-Object { Get-Random -InputObject $chars }) | Set-Content $secretFile -NoNewline
}
$password = (Get-Content $secretFile -Raw).Trim()

$sii = Get-Content "$repo\server\config\server_config.template.sii" -Raw
$sii = $sii.Replace('{{LOBBY_NAME}}', $cfg.lobbyName).Replace('{{DESCRIPTION}}', $cfg.description).
    Replace('{{WELCOME}}', $cfg.welcome).Replace('{{PASSWORD}}', $password)
Set-Content (Join-Path $home_ 'server_config.sii') $sii -NoNewline

# Server packages describe the map, DLC and mods. Export them in-game with the
# console command: export_server_packages
$found = $true
foreach ($f in 'server_packages.sii', 'server_packages.dat') {
    $src = Join-Path $gameDocs $f
    if (Test-Path $src) { Copy-Item $src $home_ -Force } else { $found = $false }
}

Write-Host "Server home: $home_"
Write-Host "Lobby:       $($cfg.lobbyName)"
Write-Host "Password:    $password  (stored in $secretFile)"
if (-not $found) {
    Write-Warning "server_packages.sii/.dat not found in $gameDocs. In ETS2, open the console (~) and run: export_server_packages"
}
