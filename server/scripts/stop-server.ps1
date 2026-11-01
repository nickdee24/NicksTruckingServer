# Stops dedicated servers.
#   stop-server.ps1          all servers
#   stop-server.ps1 event    just Event
param([string[]]$Id)
. "$PSScriptRoot\common.ps1"

foreach ($s in Get-Servers $Id) {
    $proc = Get-ServerProcess $s
    if ($proc) { $proc | Stop-Process; Write-Host "[$($s.id)] stopped" } else { Write-Host "[$($s.id)] not running" }
}
