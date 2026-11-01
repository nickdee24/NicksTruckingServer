# Builds each server's home folder from server/config. Safe to re-run.
#   setup-server.ps1             all servers
#   setup-server.ps1 main beta   just those
param([string[]]$Id)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\common.ps1"

$gameDocs = [Environment]::ExpandEnvironmentVariables($Cfg.gameDocs)
$template = Get-Content "$Repo\server\config\server_config.template.sii" -Raw

# One password for all servers, kept outside the repo so it never gets committed.
$secretFile = Join-Path $Cfg.dataRoot 'server_password.txt'
if (-not (Test-Path $secretFile)) {
    $chars = 'abcdefghjkmnpqrstuvwxyz23456789'.ToCharArray()
    -join (1..10 | ForEach-Object { Get-Random -InputObject $chars }) | Set-Content $secretFile -NoNewline
}
$password = (Get-Content $secretFile -Raw).Trim()
$lower = { param($b) if ($b) { 'true' } else { 'false' } }

$missingPackages = $false
foreach ($s in Get-Servers $Id) {
    $files = Get-ServerFiles $s
    New-Item -ItemType Directory -Force $files | Out-Null

    $values = @{
        LOBBY_NAME = $s.lobbyName; DESCRIPTION = $s.description; WELCOME = $s.welcome; PASSWORD = $password
        MAX_PLAYERS = $s.maxPlayers
        VIRTUAL_PORT = 100 + $s.portOffset; VIRTUAL_QUERY_PORT = 101 + $s.portOffset
        DEDICATED_PORT = 27015 + $s.portOffset; DEDICATED_QUERY_PORT = 27016 + $s.portOffset
        PLAYER_DAMAGE = & $lower $s.playerDamage; TRAFFIC = & $lower $s.traffic; SPEED_LIMITER = & $lower $s.forceSpeedLimiter
        SERVICE_NO_COLLISION = & $lower $s.serviceNoCollision; HIDE_IN_COMPANY = & $lower $s.hideInCompany
    }
    $sii = $template
    foreach ($k in $values.Keys) { $sii = $sii.Replace("{{$k}}", [string]$values[$k]) }
    Set-Content (Join-Path $files 'server_config.sii') $sii -NoNewline

    # Server packages describe the map, DLC and mods. Export them in-game with: export_server_packages
    foreach ($f in 'server_packages.sii', 'server_packages.dat') {
        $src = Join-Path $gameDocs $f
        if (Test-Path $src) { Copy-Item $src $files -Force } else { $missingPackages = $true }
    }
    Write-Host "[$($s.id)] $($s.lobbyName)  ports $(27015 + $s.portOffset)/$(27016 + $s.portOffset)"
}

Write-Host "Password: $password  (stored in $secretFile)"
if ($missingPackages) {
    Write-Warning "server_packages.sii/.dat not found in $gameDocs. In ETS2, open the console (~) and run: export_server_packages"
}
