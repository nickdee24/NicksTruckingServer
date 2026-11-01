# Builds ts-map and TileExport, then renders the map background into hub/public/map/tiles.
#   build-and-run.ps1 [-MaxZoom 7]
param([int]$MaxZoom = 7)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$tools = 'D:\TruckingServerData\tools'
$tsmap = Join-Path $tools 'ts-map'
$vs = & "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe" -latest -property installationPath
$msbuild = Join-Path $vs 'MSBuild\Current\Bin\amd64\MSBuild.exe'
$csc = Join-Path $vs 'MSBuild\Current\Bin\Roslyn\csc.exe'

if (-not (Test-Path $tsmap)) { git clone --depth 1 https://github.com/dariowouters/ts-map $tsmap }
$nj = Join-Path $tsmap 'packages\Newtonsoft.Json.13.0.1'
if (-not (Test-Path "$nj\lib\net45\Newtonsoft.Json.dll")) {
    New-Item -ItemType Directory -Force $nj | Out-Null
    Invoke-WebRequest https://www.nuget.org/api/v2/package/Newtonsoft.Json/13.0.1 -OutFile "$nj\pkg.zip"
    Expand-Archive "$nj\pkg.zip" $nj -Force
}
& $msbuild "$tsmap\TsMap.sln" /p:Configuration=Release /p:Platform=x64 /m /v:minimal | Out-Host

$bin = Join-Path $tsmap 'TsMap\bin\x64\Release'
$exe = Join-Path $bin 'TileExport.exe'
& $csc /nologo /platform:x64 /optimize /out:$exe /r:"$bin\TsMap.dll" /r:System.Drawing.dll "$PSScriptRoot\TileExport.cs" | Out-Host

$game = (Get-Content "$repo\server\config\server.json" -Raw | ConvertFrom-Json) | Out-Null
$gameDir = 'D:\SteamLibrary\steamapps\common\Euro Truck Simulator 2'
& $exe $gameDir "$repo\hub\public\map\tiles" $MaxZoom
