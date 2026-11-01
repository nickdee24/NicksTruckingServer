import express from 'express';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createSocket } from 'node:dgram';
import { WebSocketServer } from 'ws';
import { createSimulation } from './sim.js';
import { createServerStatus } from './servers.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, '..', 'data');
const repoRoot = path.join(here, '..', '..');
const tabletDir = path.join(repoRoot, 'tablet');
const serverStatus = createServerStatus(repoRoot);
const readJson = file => JSON.parse(readFileSync(path.join(dataDir, file), 'utf8'));

const settings = readJson('settings.json');
const DEFAULT_CB_CHANNEL = 19;
const TELEMETRY_TIMEOUT_MS = 5000;

const app = express();
app.use(express.json());
app.use('/tablet', express.static(tabletDir));
app.get('/', (_req, res) => res.redirect('/tablet/'));
app.get('/api/news', (_req, res) => res.json(readJson('news.json')));
app.get('/api/servers', (_req, res) => res.json(serverStatus()));
app.get('/api/server', (_req, res) => res.json({
  name: settings.serverName,
  cbRangeMeters: settings.cbRangeMeters,
  nearbyRangeMeters: settings.nearbyRangeMeters,
  simulation: settings.simulation.enabled
}));

const http = createServer(app);
const wss = new WebSocketServer({ server: http, path: '/ws' });
const udp = createSocket('udp4');

// Connected clients. Each one is a player at the wheel (a tablet, launcher or telemetry bridge).
const clients = new Set();
const chatHistory = [];
let nextId = 1;

const send = (ws, msg) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg));
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// Live telemetry from the game plugin (UDP), keyed by lower-cased player name.
const telemetry = new Map();
const freshTelemetry = name => {
  const t = telemetry.get(name.toLowerCase());
  return t && Date.now() - t.lastTelemetry < TELEMETRY_TIMEOUT_MS ? t : null;
};

udp.on('message', raw => {
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }
  if (msg.type !== 'telemetry' || !msg.name) return;
  const name = String(msg.name).slice(0, 32);
  telemetry.set(name.toLowerCase(), {
    id: `t-${name.toLowerCase()}`, name,
    x: Number(msg.x), z: Number(msg.z), heading: Number(msg.heading) || 0,
    speedKmh: Math.round(Number(msg.speedKmh) || 0), paused: !!msg.paused,
    truck: msg.truck || undefined, cargo: msg.cargo || undefined,
    from: msg.from || undefined, to: msg.to || undefined, lastTelemetry: Date.now()
  });
  // Keep simulated drivers around the real truck (route centre is about 3 km E, 4 km S of start).
  sim?.followPlayer(Number(msg.x), Number(msg.z));
});

// Where a client's player is: real telemetry if it is fresh, otherwise the simulated self.
function positionOf(client) {
  const p = client.player;
  const t = freshTelemetry(p.name);
  if (t) return { ...t, id: p.id };
  if (p.lastTelemetry && Date.now() - p.lastTelemetry < TELEMETRY_TIMEOUT_MS) return p;
  if (sim && settings.simulation.simulateSelfWhenNoTelemetry) {
    return { ...sim.self, id: p.id, name: p.name, simulated: true };
  }
  return null;
}

// Everyone on the map: connected clients, players with only a game plugin running, and bots.
function allDrivers() {
  // One entry per name, so a player with the tablet and launcher both open shows once.
  const byName = new Map();
  [...clients].map(positionOf).filter(Boolean).forEach(d => byName.set(d.name.toLowerCase(), d));
  const real = [...byName.values()];
  const names = new Set(byName.keys());
  const pluginOnly = [...telemetry.keys()].filter(n => !names.has(n)).map(freshTelemetry).filter(Boolean);
  return [...real, ...pluginOnly, ...(sim ? sim.drivers : [])];
}

function pushMessage(entry) {
  chatHistory.push(entry);
  if (chatHistory.length > 50) chatHistory.shift();
  clients.forEach(c => send(c.ws, { type: 'chat', ...entry }));
}

function pushCb(from, channel, text) {
  const ts = Date.now();
  clients.forEach(c => {
    const me = positionOf(c);
    if (!me || c.player.cbChannel !== channel) return;
    const d = from.id === c.player.id ? 0 : distance(me, from);
    if (d <= settings.cbRangeMeters) {
      send(c.ws, { type: 'cb', from: from.name, channel, text, ts, distance: Math.round(d) });
    }
  });
}

const sim = settings.simulation.enabled
  ? createSimulation({
      bots: settings.simulation.bots,
      onChat: (d, text) => pushMessage({ from: d.name, text, ts: Date.now() }),
      onCb: (d, text) => pushCb(d, DEFAULT_CB_CHANNEL, text)
    })
  : null;

wss.on('connection', ws => {
  const client = { ws, player: { id: `p-${nextId++}`, name: 'Driver', cbChannel: DEFAULT_CB_CHANNEL } };
  clients.add(client);
  send(ws, { type: 'welcome', id: client.player.id, server: settings.serverName, chat: chatHistory });

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const p = client.player;
    switch (msg.type) {
      case 'hello':
        p.name = String(msg.name || 'Driver').slice(0, 32);
        break;
      case 'telemetry':
        Object.assign(p, {
          x: Number(msg.x), z: Number(msg.z), heading: Number(msg.heading) || 0,
          speedKmh: Math.round(Number(msg.speedKmh) || 0),
          truck: msg.truck, cargo: msg.cargo, lastTelemetry: Date.now()
        });
        break;
      case 'chat':
        if (msg.text) pushMessage({ from: p.name, text: String(msg.text).slice(0, 300), ts: Date.now() });
        break;
      case 'cb-channel':
        p.cbChannel = Math.min(40, Math.max(1, Number(msg.channel) || DEFAULT_CB_CHANNEL));
        break;
      case 'cb': {
        const me = positionOf(client);
        if (!me || !msg.text) break;
        pushCb({ ...me, id: p.id, name: p.name }, p.cbChannel, String(msg.text).slice(0, 200));
        // A simulated driver in range sometimes answers, so CB can be tested solo.
        const listener = sim?.drivers.find(d => distance(me, d) <= settings.cbRangeMeters);
        if (listener && p.cbChannel === DEFAULT_CB_CHANNEL) {
          setTimeout(() => pushCb(listener, DEFAULT_CB_CHANNEL, sim.replyTo(p.name)), 2500);
        }
        break;
      }
    }
  });

  ws.on('close', () => clients.delete(client));
});

// Every second, send each client the drivers around them, nearest first.
setInterval(() => {
  const drivers = allDrivers();
  clients.forEach(c => {
    const me = positionOf(c);
    const others = drivers
      .filter(d => d.name.toLowerCase() !== c.player.name.toLowerCase())
      .map(d => {
        const dist = me ? distance(me, d) : null;
        return {
          id: d.id, name: d.name, truck: d.truck, cargo: d.cargo, from: d.from, to: d.to, speedKmh: d.speedKmh,
          x: Math.round(d.x), z: Math.round(d.z), heading: d.heading, isBot: !!d.isBot,
          distance: dist === null ? null : Math.round(dist),
          bearing: me ? Math.atan2(d.x - me.x, -(d.z - me.z)) : null,
          inCbRange: dist !== null && dist <= settings.cbRangeMeters
        };
      })
      .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
    send(c.ws, {
      type: 'players',
      me: me && { x: Math.round(me.x), z: Math.round(me.z), heading: me.heading, speedKmh: me.speedKmh, simulated: !!me.simulated },
      cbChannel: c.player.cbChannel,
      players: others
    });
  });
}, 1000);

udp.bind(settings.telemetryPort, () => console.log(`Listening for game telemetry on udp ${settings.telemetryPort}`));

http.listen(settings.port, () => {
  console.log(`Hub running on http://localhost:${settings.port}  (tablet: /tablet/)`);
  if (sim) console.log(`Simulation on: ${sim.drivers.length} bots`);
});
