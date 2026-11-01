// Status of the dedicated servers, read from server/config/server.json, pid files and server logs.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

export function createServerStatus(repoRoot) {
  const configPath = path.join(repoRoot, 'server', 'config', 'server.json');

  const isRunning = pidFile => {
    if (!existsSync(pidFile)) return false;
    try {
      process.kill(Number(readFileSync(pidFile, 'utf8').trim()), 0);
      return true;
    } catch {
      return false;
    }
  };

  // The log is rewritten on every start, so its last lines describe the current session.
  const readLog = logFile => {
    if (!existsSync(logFile)) return {};
    const log = readFileSync(logFile, 'utf8');
    const last = re => [...log.matchAll(re)].at(-1)?.[1];
    return {
      searchId: last(/Session search id: (\S+)/g),
      players: Number(last(/Players: (\d+)/g) ?? 0),
      gameVersion: last(/Game version: (\S+)/g)
    };
  };

  return function list() {
    const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
    // The lobby password lives outside the repo; the launcher shows it so drivers can join.
    const passwordFile = path.join(cfg.dataRoot, 'server_password.txt');
    const password = existsSync(passwordFile) ? readFileSync(passwordFile, 'utf8').trim() : null;
    return cfg.servers.map(s => {
      const root = path.join(cfg.dataRoot, 'servers', s.id);
      const online = isRunning(path.join(root, 'server.pid'));
      const log = online ? readLog(path.join(root, 'home', 'Euro Truck Simulator 2', 'server.log.txt')) : {};
      return {
        id: s.id,
        name: s.lobbyName,
        tagline: s.tagline,
        description: s.description,
        maxPlayers: s.maxPlayers,
        traffic: s.traffic,
        playerDamage: s.playerDamage,
        speedLimiter: s.forceSpeedLimiter,
        serviceNoCollision: !!s.serviceNoCollision,
        hideInCompany: !!s.hideInCompany,
        online,
        password,
        ...log
      };
    });
  };
}
