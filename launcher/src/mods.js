// Keeps the player's mod folder in step with the hub's mod pack.
// Pack files are installed with an "nts_" prefix so they never clash with the player's own mods.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PREFIX = 'nts_';

const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

async function sync(hubUrl, documentsDir, onFile = () => {}) {
  const res = await fetch(`${hubUrl}/api/modpack`);
  if (!res.ok) throw new Error(`Hub mod pack unavailable (${res.status})`);
  const pack = await res.json();

  const modDir = path.join(documentsDir, 'mod');
  fs.mkdirSync(modDir, { recursive: true });

  const wanted = new Set(pack.mods.map(m => PREFIX + m.file));
  const toFetch = pack.mods.filter(m => {
    const local = path.join(modDir, PREFIX + m.file);
    return !fs.existsSync(local) || fs.statSync(local).size !== m.size || sha256(local) !== m.sha256;
  });

  for (const [i, m] of toFetch.entries()) {
    onFile(i, toFetch.length, m.file);
    const file = await fetch(`${hubUrl}/mods/${encodeURIComponent(m.file)}`);
    if (!file.ok) throw new Error(`Could not download ${m.file}`);
    const tmp = path.join(modDir, `${PREFIX}${m.file}.part`);
    fs.writeFileSync(tmp, Buffer.from(await file.arrayBuffer()));
    if (sha256(tmp) !== m.sha256) {
      fs.rmSync(tmp);
      throw new Error(`${m.file} was corrupted while downloading`);
    }
    fs.renameSync(tmp, path.join(modDir, PREFIX + m.file));
  }

  // Remove pack files the hub no longer lists.
  for (const f of fs.readdirSync(modDir)) {
    if (f.startsWith(PREFIX) && !wanted.has(f)) fs.rmSync(path.join(modDir, f));
  }

  return { version: pack.version, downloaded: toFetch.length, needsActivation: toFetch.length > 0 };
}

module.exports = { sync };
