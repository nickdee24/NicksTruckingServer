// Traffic reports and incidents: detected from telemetry, reported by players,
// posted from the admin page, or made up by the simulation.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

export const INCIDENT_TYPES = {
  accident: { label: 'Accident', minutes: 15 },
  jam: { label: 'Traffic jam', minutes: 10 },
  slow: { label: 'Slow traffic', minutes: 6 },
  roadworks: { label: 'Roadworks', minutes: 60 },
  closure: { label: 'Road closed', minutes: 60 },
  police: { label: 'Police check', minutes: 10 },
  weather: { label: 'Bad weather', minutes: 30 }
};

const JAM_RADIUS_M = 600;

export function createTraffic({ file, onChange }) {
  let incidents = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
  let nextId = Date.now();
  const tracks = new Map(); // driver id -> recent { t, x, z, speed } samples

  const save = () => { writeFileSync(file, JSON.stringify(incidents.filter(i => i.source !== 'sim'), null, 2)); };
  const changed = () => { save(); onChange(list()); };

  function list() {
    const now = Date.now();
    return incidents.filter(i => !i.expiresAt || i.expiresAt > now);
  }

  function add({ type, x, z, note = '', source = 'admin', reporter = null, minutes }) {
    if (!INCIDENT_TYPES[type] || !Number.isFinite(x) || !Number.isFinite(z)) return null;
    // A second report of the same thing nearby refreshes the first instead of stacking.
    const dup = list().find(i => i.type === type && Math.hypot(i.x - x, i.z - z) < JAM_RADIUS_M);
    const ttl = (minutes ?? INCIDENT_TYPES[type].minutes) * 60000;
    if (dup) {
      dup.expiresAt = Date.now() + ttl;
      dup.reports = (dup.reports ?? 1) + 1;
      changed();
      return dup;
    }
    const incident = {
      id: String(nextId++), type, label: INCIDENT_TYPES[type].label, x, z,
      note: String(note).slice(0, 200), source, reporter,
      createdAt: Date.now(), expiresAt: ttl > 0 ? Date.now() + ttl : null, reports: 1
    };
    incidents.push(incident);
    changed();
    return incident;
  }

  function remove(id) {
    const before = incidents.length;
    incidents = incidents.filter(i => i.id !== id);
    if (incidents.length !== before) changed();
  }

  // Feed each driver's position once a second. Detects hard stops and sitting in slow traffic.
  function observe(drivers) {
    const now = Date.now();
    for (const d of drivers) {
      if (d.isBot || d.simulated || d.paused || !Number.isFinite(d.x)) continue;
      const track = tracks.get(d.id) ?? [];
      track.push({ t: now, x: d.x, z: d.z, speed: d.speedKmh ?? 0 });
      while (track.length && now - track[0].t > 120000) track.shift();
      tracks.set(d.id, track);

      // Hard stop: from motorway speed to a standstill within 3 seconds.
      const recent = track.filter(s => now - s.t <= 3000);
      if (recent.length >= 2 && recent[0].speed > 60 && recent.at(-1).speed < 5) {
        add({ type: 'accident', x: d.x, z: d.z, note: `Sudden stop by ${d.name}`, source: 'auto', reporter: d.name });
        track.length = 0;
        continue;
      }

      // Slow traffic: crawling (moving, but under 20 km/h) for the last 90 seconds.
      const window = track.filter(s => now - s.t <= 90000);
      const crawling = window.length > 80 && window.every(s => s.speed > 1 && s.speed < 20);
      if (crawling) {
        const others = drivers.filter(o => o.id !== d.id && Math.hypot(o.x - d.x, o.z - d.z) < JAM_RADIUS_M && (o.speedKmh ?? 0) < 20);
        add({ type: others.length ? 'jam' : 'slow', x: d.x, z: d.z, note: 'Detected from live traffic', source: 'auto' });
        track.length = 0;
      }
    }
  }

  // Expired incidents drop off; tell clients when that happens.
  let lastCount = list().length;
  setInterval(() => {
    const n = list().length;
    if (n !== lastCount) { lastCount = n; onChange(list()); }
  }, 10000);

  return { list, add, remove, observe };
}
