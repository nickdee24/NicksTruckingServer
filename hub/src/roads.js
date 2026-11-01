// Builds a map of the roads you have driven from real telemetry, so the live map
// has roads to draw without needing any map data taken from the game.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const MIN_STEP_M = 40;      // record a point every 40 m of travel
const GAP_M = 400;          // a jump bigger than this (ferry, teleport, load) starts a new line
const GRID_M = 25;          // points closer than this to an existing one are not stored again

export function createRoads({ file }) {
  const data = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { lines: [], cities: {} };
  const seen = new Set(data.lines.flat().map(([x, z]) => `${Math.round(x / GRID_M)},${Math.round(z / GRID_M)}`));
  const open = new Map(); // driver name -> line being drawn
  let dirty = false;

  function record(driver) {
    if (driver.isBot || driver.simulated || driver.paused || !Number.isFinite(driver.x)) return;
    const key = `${Math.round(driver.x / GRID_M)},${Math.round(driver.z / GRID_M)}`;
    let line = open.get(driver.name);
    const last = line?.at(-1);
    const step = last ? Math.hypot(driver.x - last[0], driver.z - last[1]) : Infinity;
    if (last && step < MIN_STEP_M) return;
    if (!line || step > GAP_M || seen.has(key)) {
      // Start a fresh line when jumping, or when rejoining a road that is already mapped.
      if (seen.has(key)) { open.delete(driver.name); return; }
      line = [];
      data.lines.push(line);
      open.set(driver.name, line);
    }
    line.push([Math.round(driver.x), Math.round(driver.z)]);
    seen.add(key);
    dirty = true;
  }

  // Remember where job cities are, using where the truck was when a job started or ended there.
  function noteCity(name, x, z) {
    if (!name || data.cities[name]) return;
    data.cities[name] = [Math.round(x), Math.round(z)];
    dirty = true;
  }

  setInterval(() => {
    if (!dirty) return;
    dirty = false;
    writeFileSync(file, JSON.stringify(data));
  }, 15000);

  return { record, noteCity, get: () => data };
}
