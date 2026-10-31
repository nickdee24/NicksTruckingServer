# Phase 1: running the private Convoy server

Everything big lives in `D:\TruckingServerData`:

| Path | What |
| --- | --- |
| `steamcmd\` | Valve's SteamCMD |
| `ets2ds\` | ETS2 Dedicated Server (Steam app 1948160) |
| `home\` | The server's home folder: `server_config.sii`, `server_packages.*`, logs |
| `server_password.txt` | The lobby password (not in git) |

## One-time step in the game

The server needs to know your map, DLC and mods. Export them from the game:

1. Start ETS2 and load your profile with the DLC and mods you want on the server.
2. Press `~` to open the console and run `export_server_packages`.
3. Close the game, then run `server\scripts\setup-server.ps1`.

## Day to day

| Task | Command |
| --- | --- |
| Rebuild config after editing `server/config/server.json` | `server\scripts\setup-server.ps1` |
| Start the server | `server\scripts\start-server.ps1` |
| Stop the server | `server\scripts\stop-server.ps1` |
| Update the server after an ETS2 patch | `server\scripts\update-server.ps1` |

## Joining

In ETS2, choose Convoy, then Search, find "Nick's Trucking Server" and enter the password from `server_password.txt`.
The server is hidden from the public list (`show_server: false`), so use the search box.
