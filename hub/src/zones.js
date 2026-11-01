// Zones: truck stops, fuel stations and company depots, with a notice shown while you are inside.
// The game doesn't tell plugins when you enter these areas, so zones are learned from what you do
// there (refuelling, starting or finishing a job) or added by hand on the admin page.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

export const ZONE_KINDS = {
  service: { label: 'Truck stop / fuel station', radius: 150 },
  depot: { label: 'Company depot', radius: 180 },
  custom: { label: 'Custom area', radius: 200 }
};

const EXIT_MARGIN_M = 40; // leave a little past the edge, so the notice doesn't flicker at the boundary

export function createZones({ file, onChange }) {
  let zones = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
  let nextId = Date.now();
  const inside = new Map(); // driver name -> zone id
  const lastFuel = new Map(); // driver name -> { fuel, t }

  const save = () => { writeFileSync(file, JSON.stringify(zones, null, 2)); onChange?.(zones); };
  const list = () => zones;

  function add({ kind, x, z, name, radius, message, source = 'admin' }) {
    if (!ZONE_KINDS[kind] || !Number.isFinite(x) || !Number.isFinite(z)) return null;
    const r = Number(radius) || ZONE_KINDS[kind].radius;
    // Learned zones that overlap an existing one of the same kind are the same place.
    const existing = zones.find(zn => zn.kind === kind && Math.hypot(zn.x - x, zn.z - z) < Math.max(zn.radius, r));
    if (existing) {
      if (name && !existing.name) { existing.name = name; save(); }
      return existing;
    }
    const zone = {
      id: String(nextId++), kind, name: name ? String(name).slice(0, 60) : '',
      x: Math.round(x), z: Math.round(z), radius: r,
      message: message ? String(message).slice(0, 120) : null, source
    };
    zones.push(zone);
    save();
    return zone;
  }

  function update(id, changes) {
    const zone = zones.find(zn => zn.id === id);
    if (!zone) return null;
    for (const key of ['name', 'message']) if (key in changes) zone[key] = changes[key] ? String(changes[key]).slice(0, 120) : null;
    if ('radius' in changes && Number(changes.radius) > 0) zone.radius = Number(changes.radius);
    save();
    return zone;
  }

  function remove(id) {
    zones = zones.filter(zn => zn.id !== id);
    save();
  }

  // Refuelling: fuel going up while parked means this is a fuel station.
  function watchFuel(driver) {
    if (!Number.isFinite(driver.fuel)) return;
    const prev = lastFuel.get(driver.name);
    lastFuel.set(driver.name, { fuel: driver.fuel, t: Date.now() });
    if (prev && driver.fuel - prev.fuel > 1 && (driver.speedKmh ?? 0) < 3) {
      add({ kind: 'service', x: driver.x, z: driver.z, source: 'learned' });
    }
  }

  // Returns the zone the driver just entered or left, or null if nothing changed.
  function check(driver) {
    const currentId = inside.get(driver.name);
    const current = zones.find(zn => zn.id === currentId);
    if (current && Math.hypot(current.x - driver.x, current.z - driver.z) <= current.radius + EXIT_MARGIN_M) return null;

    const now = zones.find(zn => Math.hypot(zn.x - driver.x, zn.z - driver.z) <= zn.radius) ?? null;
    if ((now?.id ?? null) === (currentId ?? null)) return null;
    if (now) inside.set(driver.name, now.id); else inside.delete(driver.name);
    return { zone: now };
  }

  return { list, add, update, remove, watchFuel, check };
}
