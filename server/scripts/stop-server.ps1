# Stops the ETS2 dedicated server.
Get-Process eurotrucks2_server -ErrorAction SilentlyContinue | Stop-Process
Write-Host 'Server stopped.'
