// Keeps the player's mod folder in step with the hub's mod pack.
// Files keep their original names: the game names a mod's package after its file, and the
// server's package list must match exactly. The launcher remembers which files it installed
// (nts_modpack.json) so it only ever removes its own.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const RECORD = 'nts_modpack.json';

const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

async function sync(hubUrl, documentsDir, onFile = () => {}) {
  const res = await fetch(`${hubUrl}/api/modpack`);
  if (!res.ok) throw new Error(`Hub mod pack unavailable (${res.status})`);
  const pack = await res.json();

  const modDir = path.join(documentsDir, 'mod');
  fs.mkdirSync(modDir, { recursive: true });
  const recordFile = path.join(modDir, RECORD);
  const installed = new Set(fs.existsSync(recordFile) ? JSON.parse(fs.readFileSync(recordFile, 'utf8')) : []);

  const toFetch = pack.mods.filter(m => {
    const local = path.join(modDir, m.file);
    return !fs.existsSync(local) || fs.statSync(local).size !== m.size || sha256(local) !== m.sha256;
  });

  for (const [i, m] of toFetch.entries()) {
    onFile(i, toFetch.length, m.file);
    const file = await fetch(`${hubUrl}/mods/${encodeURIComponent(m.file)}`);
    if (!file.ok) throw new Error(`Could not download ${m.file}`);
    const tmp = path.join(modDir, `${m.file}.part`);
    fs.writeFileSync(tmp, Buffer.from(await file.arrayBuffer()));
    if (sha256(tmp) !== m.sha256) {
      fs.rmSync(tmp);
      throw new Error(`${m.file} was corrupted while downloading`);
    }
    fs.renameSync(tmp, path.join(modDir, m.file));
    installed.add(m.file);
  }

  // Remove files this launcher installed that the hub no longer lists. The player's own mods are never touched.
  const wanted = new Set(pack.mods.map(m => m.file));
  for (const f of [...installed]) {
    if (wanted.has(f)) continue;
    if (fs.existsSync(path.join(modDir, f))) fs.rmSync(path.join(modDir, f));
    installed.delete(f);
  }
  fs.writeFileSync(recordFile, JSON.stringify([...installed], null, 2));

  return { version: pack.version, downloaded: toFetch.length, needsActivation: toFetch.length > 0 };
}

module.exports = { sync };
