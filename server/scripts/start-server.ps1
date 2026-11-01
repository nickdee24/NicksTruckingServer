# Starts dedicated servers in the background.
#   start-server.ps1          all servers
#   start-server.ps1 main     just Main
# -nosingle lets them run alongside the game and each other on the same PC.
param([string[]]$Id)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\common.ps1"

if (-not (Test-Path $ServerExe)) { throw "Dedicated server not installed at $ServerExe. Run update-server.ps1 first." }

foreach ($s in Get-Servers $Id) {
    if (Get-ServerProcess $s) { Write-Host "[$($s.id)] already running"; continue }
    $files = Get-ServerFiles $s
    if (-not (Test-Path "$files\server_packages.sii")) { throw "[$($s.id)] server packages missing. Run setup-server.ps1 first." }

    $proc = Start-Process $ServerExe -ArgumentList "-homedir `"$(Get-ServerHome $s)`"", '-nosingle' `
        -WorkingDirectory (Split-Path $ServerExe) -WindowStyle Minimized -PassThru
    Set-Content (Get-ServerPidFile $s) $proc.Id
    Write-Host "[$($s.id)] starting (pid $($proc.Id)). Log: $files\server.log.txt"
}
