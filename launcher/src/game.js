// Finding, preparing and starting Euro Truck Simulator 2.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const APP_ID = '227300';
const EXE = path.join('bin', 'win_x64', 'eurotrucks2.exe');

// Reads Steam's library list and returns the folder that actually contains the game files.
function findGameDir() {
  const steamRoots = ['C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam'];
  const libraries = new Set();
  for (const root of steamRoots) {
    const vdf = path.join(root, 'steamapps', 'libraryfolders.vdf');
    if (!fs.existsSync(vdf)) continue;
    for (const m of fs.readFileSync(vdf, 'utf8').matchAll(/"path"\s+"([^"]+)"/g)) {
      libraries.add(m[1].replace(/\\\\/g, '\\'));
    }
  }
  for (const lib of libraries) {
    const dir = path.join(lib, 'steamapps', 'common', 'Euro Truck Simulator 2');
    if (fs.existsSync(path.join(dir, EXE)) && fs.existsSync(path.join(dir, 'base.scs'))) return dir;
  }
  return null;
}

const documentsDir = () => path.join(process.env.USERPROFILE, 'Documents', 'Euro Truck Simulator 2');

// Points the NTS telemetry plugin at the hub as this player.
function configureTelemetry(gameDir, { playerName, hubHost, telemetryPort }) {
  const pluginDir = path.join(gameDir, 'bin', 'win_x64', 'plugins');
  const dll = path.join(pluginDir, 'nts_telemetry.dll');
  const bundled = path.join(__dirname, '..', '..', 'telemetry-plugin', 'build', 'nts_telemetry.dll');
  fs.mkdirSync(pluginDir, { recursive: true });
  if (fs.existsSync(bundled)) {
    const stale = !fs.existsSync(dll) || fs.statSync(bundled).mtimeMs > fs.statSync(dll).mtimeMs;
    if (stale) fs.copyFileSync(bundled, dll);
  }
  fs.writeFileSync(path.join(pluginDir, 'nts_telemetry.ini'),
    `name=${playerName}\nhost=${hubHost}\nport=${telemetryPort}\n`);
  return fs.existsSync(dll);
}

function isGameRunning() {
  const { execSync } = require('node:child_process');
  try {
    return execSync('tasklist /FI "IMAGENAME eq eurotrucks2.exe" /NH', { encoding: 'utf8' }).includes('eurotrucks2.exe');
  } catch {
    return false;
  }
}

// -nointro skips the SCS intro videos; the launcher has already played ours.
function launchGame(gameDir, extraArgs = []) {
  const exe = path.join(gameDir, EXE);
  const child = spawn(exe, ['-nointro', ...extraArgs], { cwd: path.dirname(exe), detached: true, stdio: 'ignore' });
  child.unref();
  return child;
}

module.exports = { APP_ID, findGameDir, documentsDir, configureTelemetry, isGameRunning, launchGame };
