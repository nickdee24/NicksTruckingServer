import express from 'express';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createSocket } from 'node:dgram';
import { WebSocketServer } from 'ws';
import { createSimulation } from './sim.js';
import { createServerStatus } from './servers.js';
import { createModpack } from './modpack.js';
import { createTraffic, INCIDENT_TYPES } from './traffic.js';
import { createRoads } from './roads.js';
import { createZones, ZONE_KINDS } from './zones.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, '..', 'data');
const repoRoot = path.join(here, '..', '..');
const tabletDir = path.join(repoRoot, 'tablet');
const serverStatus = createServerStatus(repoRoot);
const modpack = createModpack(repoRoot);
const readJson = file => JSON.parse(readFileSync(path.join(dataDir, file), 'utf8'));

const settings = readJson('settings.json');
const DEFAULT_CB_CHANNEL = 19;
const TELEMETRY_TIMEOUT_MS = 5000;

const app = express();
app.use(express.json());
// The launcher loads pages from file://, so allow cross-origin reads.
app.use((_req, res, next) => { res.set('Access-Control-Allow-Origin', '*'); next(); });
app.use('/tablet', express.static(tabletDir));
app.use('/mods', express.static(modpack.packDir));
app.use('/map', express.static(path.join(here, '..', 'public', 'map')));
app.use('/admin', express.static(path.join(here, '..', 'public', 'admin')));
// Images for news posts: put them in hub/public/media and set "image": "/media/file.jpg" on the post.
app.use('/media', express.static(path.join(here, '..', 'public', 'media')));
// Map background tiles, rendered by tools/map-tiles into hub/public/map/tiles.
app.get('/api/map', (_req, res) => {
  const info = path.join(here, '..', 'public', 'map', 'tiles', 'tiles.json');
  res.json({ tiles: existsSync(info) ? { url: '/map/tiles/{z}/{x}/{y}.png', ...JSON.parse(readFileSync(info, 'utf8')) } : null });
});
app.get('/api/modpack', async (_req, res, next) => {
  try { res.json(await modpack.manifest()); } catch (err) { next(err); }
});
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
const broadcast = msg => clients.forEach(c => send(c.ws, msg));
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

const traffic = createTraffic({
  file: path.join(dataDir, 'incidents.json'),
  onChange: items => broadcast({ type: 'incidents', items })
});
const roads = createRoads({ file: path.join(dataDir, 'roads.json') });
const zones = createZones({ file: path.join(dataDir, 'zones.json') });

// Which settings each server runs with, refreshed every few seconds (zone notices depend on them).
let serverInfo = new Map();
const refreshServerInfo = () => { serverInfo = new Map(serverStatus().map(s => [s.id, s])); };
refreshServerInfo();
setInterval(refreshServerInfo, 10000);

// The notice for a zone on a given server, or null if that server doesn't change anything there.
function zoneNotice(zone, serverId) {
  if (!zone) return null;
  if (zone.message) return zone.message;
  const server = serverInfo.get(serverId) ?? serverInfo.get('main');
  if (zone.kind === 'service' && !server?.serviceNoCollision) return null;
  if (zone.kind === 'depot' && !server?.hideInCompany) return null;
  return settings.zoneNotices[zone.kind] || null;
}

app.get('/api/zones', (_req, res) => res.json({ kinds: ZONE_KINDS, items: zones.list() }));
app.post('/api/admin/zones', localOnly, (req, res) => {
  const { kind, x, z, name, radius, message } = req.body ?? {};
  const zone = zones.add({ kind, x: Number(x), z: Number(z), name, radius, message, source: 'admin' });
  zone ? res.json(zone) : res.status(400).json({ error: 'Need a known kind and a position' });
});
app.patch('/api/admin/zones/:id', localOnly, (req, res) => {
  const zone = zones.update(req.params.id, req.body ?? {});
  zone ? res.json(zone) : res.status(404).json({ error: 'No such zone' });
});
app.delete('/api/admin/zones/:id', localOnly, (req, res) => { zones.remove(req.params.id); res.json({ ok: true }); });

// Admin endpoints only answer requests made on this PC.
function localOnly(req, res, next) {
  const ip = req.socket.remoteAddress;
  if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') return next();
  res.status(403).json({ error: 'Admin is only available on the server PC' });
}

app.get('/api/incidents', (_req, res) => res.json({ types: INCIDENT_TYPES, items: traffic.list() }));
app.get('/api/roads', (_req, res) => res.json(roads.get()));
app.post('/api/admin/incidents', localOnly, (req, res) => {
  const { type, x, z, note, minutes } = req.body ?? {};
  const added = traffic.add({ type, x: Number(x), z: Number(z), note, minutes: minutes === undefined ? undefined : Number(minutes), source: 'admin' });
  added ? res.json(added) : res.status(400).json({ error: 'Need a known type and a position' });
});
app.delete('/api/admin/incidents/:id', localOnly, (req, res) => { traffic.remove(req.params.id); res.json({ ok: true }); });
app.post('/api/admin/news', localOnly, (req, res) => {
  const { title, body, tag } = req.body ?? {};
  if (!title || !body) return res.status(400).json({ error: 'Need a title and body' });
  const news = readJson('news.json');
  const item = { id: String(Date.now()), date: new Date().toISOString().slice(0, 10), title: String(title), tag: String(tag || 'News'), body: String(body) };
  news.unshift(item);
  writeFileSync(path.join(dataDir, 'news.json'), JSON.stringify(news, null, 2));
  broadcast({ type: 'news', item });
  res.json(item);
});
// In-game announcement: a banner at the top centre of every driver's overlay.
app.post('/api/admin/announce', localOnly, (req, res) => {
  const { title, text, seconds, style } = req.body ?? {};
  if (!text) return res.status(400).json({ error: 'Need some text' });
  const announcement = {
    type: 'announcement', title: String(title || settings.serverName).slice(0, 80), text: String(text).slice(0, 300),
    seconds: Math.min(120, Math.max(3, Number(seconds) || 10)), style: ['info', 'warning', 'event'].includes(style) ? style : 'info',
    ts: Date.now()
  };
  broadcast(announcement);
  res.json(announcement);
});
app.delete('/api/admin/news/:id', localOnly, (req, res) => {
  const news = readJson('news.json').filter(n => n.id !== req.params.id);
  writeFileSync(path.join(dataDir, 'news.json'), JSON.stringify(news, null, 2));
  res.json({ ok: true });
});

// Live telemetry from the game plugin (UDP), keyed by lower-cased player name.
const telemetry = new Map();
const freshTelemetry = name => {
  const t = telemetry.get(name.toLowerCase());
  return t && Date.now() - t.lastTelemetry < TELEMETRY_TIMEOUT_MS ? t : null;
};

// Lets the launcher's Settings page check that the game plugin is reaching the hub.
app.get('/api/telemetry/:name', (req, res) => {
  const t = telemetry.get(req.params.name.toLowerCase());
  res.json({ seen: !!t, secondsAgo: t ? Math.round((Date.now() - t.lastTelemetry) / 1000) : null, truck: t?.truck ?? null });
});

udp.on('message', raw => {
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }
  if (!msg.name) return;
  const name = String(msg.name).slice(0, 32);

  // A delivered job means the truck is parked at a company depot.
  if (msg.type === 'gameplay') {
    if (msg.event === 'job.delivered') zones.add({ kind: 'depot', x: Number(msg.x), z: Number(msg.z), source: 'learned' });
    return;
  }
  if (msg.type !== 'telemetry') return;

  const prev = telemetry.get(name.toLowerCase());
  // A new job starts where the truck is (at the pickup depot); a finished job ended at its destination.
  if (msg.from && msg.from !== prev?.from) {
    roads.noteCity(msg.from, Number(msg.x), Number(msg.z));
    if (prev) zones.add({ kind: 'depot', x: Number(msg.x), z: Number(msg.z), name: msg.from, source: 'learned' });
  }
  if (prev?.to && !msg.cargo && prev.cargo) roads.noteCity(prev.to, Number(msg.x), Number(msg.z));
  telemetry.set(name.toLowerCase(), {
    id: `t-${name.toLowerCase()}`, name,
    x: Number(msg.x), z: Number(msg.z), heading: Number(msg.heading) || 0,
    speedKmh: Math.round(Number(msg.speedKmh) || 0), paused: !!msg.paused,
    truck: msg.truck || undefined, cargo: msg.cargo || undefined,
    from: msg.from || undefined, to: msg.to || undefined, fuel: Number(msg.fuel), lastTelemetry: Date.now()
  });
  zones.watchFuel(telemetry.get(name.toLowerCase()));
  // Every packet (4 a second), so driven roads follow curves closely.
  roads.record(telemetry.get(name.toLowerCase()));
  // Keep simulated drivers around the real truck (route centre is about 3 km E, 4 km S of start).
  sim?.followPlayer(Number(msg.x), Number(msg.z));
});

// Where a client's player is: real telemetry if it is fresh, otherwise the simulated self.
function positionOf(client) {
  const p = client.player;
  if (p.spectator) return null;
  const t = freshTelemetry(p.name);
  if (t) return { ...t, id: p.id, server: p.server };
  if (p.lastTelemetry && Date.now() - p.lastTelemetry < TELEMETRY_TIMEOUT_MS) return p;
  if (sim && settings.simulation.simulateSelfWhenNoTelemetry) {
    return { ...sim.self, id: p.id, name: p.name, server: p.server, simulated: true };
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
  send(ws, { type: 'incidents', items: traffic.list() });

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const p = client.player;
    switch (msg.type) {
      case 'hello':
        p.name = String(msg.name || 'Driver').slice(0, 32);
        // The live map watches without being a driver.
        p.spectator = msg.role === 'map';
        p.server = msg.server ? String(msg.server) : p.server;
        break;
      case 'report': {
        const me = positionOf(client);
        if (me) traffic.add({ type: msg.incidentType, x: me.x, z: me.z, note: msg.note, source: 'player', reporter: p.name });
        break;
      }
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
  traffic.observe(drivers);
  drivers.forEach(roads.record);

  const world = drivers.map(d => ({
    id: d.id, name: d.name, x: Math.round(d.x), z: Math.round(d.z), heading: d.heading,
    speedKmh: d.speedKmh, truck: d.truck, cargo: d.cargo, to: d.to, server: d.server ?? 'main', isBot: !!d.isBot, simulated: !!d.simulated
  }));

  clients.forEach(c => {
    if (c.player.spectator) return send(c.ws, { type: 'world', drivers: world });
    const me = positionOf(c);

    // Zone notices: tell the overlay when this driver enters or leaves a zone.
    if (me) {
      const change = zones.check({ ...me, name: `${c.player.id}` });
      if (change) {
        const notice = zoneNotice(change.zone, c.player.server);
        send(c.ws, { type: 'zone', zone: change.zone && { id: change.zone.id, kind: change.zone.kind, name: change.zone.name }, notice });
      }
    }
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

// The simulation makes up the odd incident near its drivers, so reports can be seen solo.
if (sim) {
  setInterval(() => {
    const d = sim.drivers[Math.floor(Math.random() * sim.drivers.length)];
    const types = ['accident', 'jam', 'roadworks', 'police', 'slow'];
    traffic.add({ type: types[Math.floor(Math.random() * types.length)], x: d.x, z: d.z, note: `Reported by ${d.name}`, source: 'sim', reporter: d.name, minutes: 5 });
  }, settings.simulation.incidentEverySeconds * 1000);
}

udp.bind(settings.telemetryPort, () => console.log(`Listening for game telemetry on udp ${settings.telemetryPort}`));

http.listen(settings.port, () => {
  console.log(`Hub running on http://localhost:${settings.port}  (tablet: /tablet/)`);
  if (sim) console.log(`Simulation on: ${sim.drivers.length} bots`);
});
