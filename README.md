# Nick's Trucking Server

A private, HaulMP-style setup for Euro Truck Simulator 2, built around the official ETS2 Dedicated Server (Convoy).
All branding and artwork here is original. No HaulMP or SCS logos or assets are included.

## Start everything

Double-click the "Nick's Trucking" shortcut on the desktop, or run:

```
powershell -ExecutionPolicy Bypass -File C:\TruckingServer\start-all.ps1
```

This starts the Main, Beta and Event servers, the hub (http://localhost:7420) and the launcher.

## What's here

| Folder | What lives there |
| --- | --- |
| `server/` | Dedicated server config (`server/config/server.json`) and start/stop scripts |
| `hub/` | Node.js hub: news, server status, players, chat, CB, traffic incidents, mod pack, live map, admin page |
| `launcher/` | Electron launcher (intro, news, server select, Play) and the in-game overlay |
| `tablet/` | The tablet and HUD overlay. Theme, apps and layout in `tablet/config.json` |
| `telemetry-plugin/` | Game plugin built on the official SCS Telemetry SDK. Build with `build.cmd` |
| `mods/` | Mod pack: drop `.scs` files in `mods/pack/` and the launcher installs them for every driver |
| `docs/` | Guides |

Large installs live outside the repo in `D:\TruckingServerData` (SteamCMD, the dedicated server, each server's files).

## Pages

| Page | Address |
| --- | --- |
| Tablet | http://localhost:7420/tablet/ |
| Live map | http://localhost:7420/map/ |
| Admin (news, incidents, server status) | http://localhost:7420/admin/ |

## How a session works

1. The launcher plays your intro, shows news and the three servers with live status.
   Drop your own video at `launcher/assets/intro.mp4` to replace the animated logo.
2. Play syncs the mod pack, points the telemetry plugin at the hub, and starts ETS2 with `-nointro`.
3. In the game, open Convoy → Search and paste the session id the launcher shows.
4. Press F8 (change it in launcher settings) for the tablet. With the tablet open you can drag the HUD boxes anywhere.

The overlay needs the game in borderless fullscreen or windowed mode, not exclusive fullscreen.

See `docs/tablet.md` for customising the tablet and `docs/phase1-server.md` for the servers.
