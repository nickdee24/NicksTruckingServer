// Launcher main process: launcher window, Play flow and the in-game overlay.
const { app, BrowserWindow, ipcMain, globalShortcut, screen, clipboard, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const game = require('./game');
const mods = require('./mods');

const DEFAULTS = {
  playerName: 'Nick',
  hubUrl: 'http://localhost:7420',
  telemetryPort: 7421,
  overlayHotkey: 'F8',
  dashTruckUrl: 'http://localhost:27766/',
  // Added after -nointro. -unlimitedlog keeps the whole game.log.txt for troubleshooting;
  // add -rdevice dx11 to force DirectX 11.
  gameArgs: '-unlimitedlog',
  lastServer: 'main',
  playIntro: true
};

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) }; } catch { return { ...DEFAULTS }; }
}
function saveSettings(next) {
  settings = { ...settings, ...next };
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));
  registerHotkey();
  return settings;
}

let settings;
let launcherWin = null;
let overlayWin = null;
let overlayVisible = false;
let gameWatch = null;

function createLauncher() {
  launcherWin = new BrowserWindow({
    width: 1180,
    height: 720,
    minWidth: 960,
    minHeight: 600,
    frame: false,
    backgroundColor: '#0d1117',
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js') }
  });
  launcherWin.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  launcherWin.once('ready-to-show', () => launcherWin.show());
  // Dev aid: NTS_SCREENSHOT=<file.png> saves a screenshot of the launcher after the intro, then quits.
  if (process.env.NTS_SCREENSHOT) {
    setTimeout(async () => {
      fs.writeFileSync(process.env.NTS_SCREENSHOT, (await launcherWin.webContents.capturePage()).toPNG());
      app.quit();
    }, Number(process.env.NTS_SCREENSHOT_DELAY) || 6000);
  }
  launcherWin.on('closed', () => { launcherWin = null; });
}

const overlayUrl = () => `${settings.hubUrl}/tablet/overlay.html?name=${encodeURIComponent(settings.playerName)}&server=${encodeURIComponent(settings.lastServer)}`;

// A see-through, always-on-top window over the game. Clicks pass through it until the tablet is opened.
function createOverlay() {
  // Already open: reload so it knows which server was picked this time.
  if (overlayWin) return overlayWin.loadURL(overlayUrl());
  const { bounds } = screen.getPrimaryDisplay();
  overlayWin = new BrowserWindow({
    ...bounds,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'overlay-preload.js') }
  });
  overlayWin.setAlwaysOnTop(true, 'screen-saver');
  overlayWin.setVisibleOnAllWorkspaces(true);
  overlayWin.setIgnoreMouseEvents(true, { forward: true });
  overlayWin.loadURL(overlayUrl());
  overlayWin.on('closed', () => { overlayWin = null; overlayVisible = false; });
}

function setOverlayVisible(visible) {
  if (!overlayWin) return;
  overlayVisible = visible;
  overlayWin.setIgnoreMouseEvents(!visible, { forward: true });
  overlayWin.setFocusable(visible);
  if (visible) overlayWin.focus();
  overlayWin.webContents.send('overlay:visible', visible);
}

function registerHotkey() {
  globalShortcut.unregisterAll();
  try {
    globalShortcut.register(settings.overlayHotkey, () => setOverlayVisible(!overlayVisible));
  } catch (err) {
    console.error('Hotkey not registered:', err.message);
  }
}

// Closes the overlay and brings the launcher back when the game exits.
function watchGame() {
  clearInterval(gameWatch);
  let seen = false;
  gameWatch = setInterval(() => {
    const running = game.isGameRunning();
    if (running) seen = true;
    else if (seen) {
      clearInterval(gameWatch);
      overlayWin?.close();
      launcherWin?.restore();
      launcherWin?.webContents.send('game:exited');
    }
  }, 5000);
}

async function play(serverId) {
  const progress = (step, detail) => launcherWin?.webContents.send('play:progress', { step, detail });
  saveSettings({ lastServer: serverId });

  progress('find', 'Finding Euro Truck Simulator 2…');
  const gameDir = game.findGameDir();
  if (!gameDir) throw new Error('Could not find Euro Truck Simulator 2 in your Steam libraries.');

  progress('mods', 'Checking the mod pack…');
  const result = await mods.sync(settings.hubUrl, game.documentsDir(), (done, total, file) =>
    progress('mods', `Downloading ${file} (${done + 1} of ${total})…`));
  progress('mods', result.downloaded ? `Installed ${result.downloaded} mod file(s)` : 'Mod pack up to date');

  progress('telemetry', 'Connecting your truck to the hub…');
  const hubHost = new URL(settings.hubUrl).hostname.replace('localhost', '127.0.0.1');
  game.configureTelemetry(gameDir, { playerName: settings.playerName, hubHost, telemetryPort: settings.telemetryPort });

  if (game.isGameRunning()) {
    progress('launch', 'The game is already running');
  } else {
    progress('launch', 'Starting the game…');
    game.launchGame(gameDir, settings.gameArgs.split(/\s+/).filter(Boolean));
  }
  createOverlay();
  watchGame();
  progress('done', 'Ready');
  return { modsActivated: result.needsActivation };
}

app.whenReady().then(() => {
  settings = loadSettings();
  createLauncher();
  registerHotkey();

  ipcMain.handle('settings:get', () => settings);
  ipcMain.handle('settings:set', (_e, next) => saveSettings(next));
  ipcMain.handle('game:find', () => game.findGameDir());
  ipcMain.handle('play', (_e, serverId) => play(serverId));
  ipcMain.handle('clipboard:write', (_e, text) => clipboard.writeText(String(text)));
  ipcMain.handle('open:external', (_e, url) => /^https?:\/\//.test(url) && shell.openExternal(url));
  ipcMain.handle('overlay:toggle', () => setOverlayVisible(!overlayVisible));
  ipcMain.handle('window:minimize', () => launcherWin?.minimize());
  ipcMain.handle('window:close', () => app.quit());
  ipcMain.on('overlay:close-request', () => setOverlayVisible(false));
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
