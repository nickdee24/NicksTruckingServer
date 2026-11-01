# Shared helpers for the server scripts. Dot-source this file.
$script:Repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$script:Cfg = Get-Content "$Repo\server\config\server.json" -Raw | ConvertFrom-Json
$script:ServerExe = Join-Path $Cfg.dataRoot 'ets2ds\bin\win_x64\eurotrucks2_server.exe'

# Picks servers by id; no ids means all of them.
function Get-Servers([string[]]$Ids) {
    $all = $Cfg.servers
    if (-not $Ids) { return $all }
    foreach ($id in $Ids) {
        if (-not ($all | Where-Object id -eq $id)) { throw "Unknown server '$id'. Known: $(($all.id) -join ', ')" }
    }
    $all | Where-Object { $Ids -contains $_.id }
}

# Each server is started with -homedir <root> and keeps its files in "<root>\Euro Truck Simulator 2".
function Get-ServerRoot($server) { Join-Path $Cfg.dataRoot "servers\$($server.id)" }
function Get-ServerHome($server) { Join-Path (Get-ServerRoot $server) 'home' }
function Get-ServerFiles($server) { Join-Path (Get-ServerHome $server) 'Euro Truck Simulator 2' }
function Get-ServerPidFile($server) { Join-Path (Get-ServerRoot $server) 'server.pid' }

function Get-ServerProcess($server) {
    $pidFile = Get-ServerPidFile $server
    if (-not (Test-Path $pidFile)) { return $null }
    Get-Process -Id ([int](Get-Content $pidFile)) -ErrorAction SilentlyContinue |
        Where-Object ProcessName -eq 'eurotrucks2_server'
}
