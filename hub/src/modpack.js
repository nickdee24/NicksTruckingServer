// The mod pack: every .scs file in mods/pack, listed with size and checksum for the launcher.
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export function createModpack(repoRoot) {
  const packDir = path.join(repoRoot, 'mods', 'pack');
  const metaFile = path.join(repoRoot, 'mods', 'modpack.json');
  mkdirSync(packDir, { recursive: true });
  const hashes = new Map(); // file -> { mtimeMs, sha256 }

  const hashFile = file => new Promise((resolve, reject) => {
    const h = createHash('sha256');
    createReadStream(file).on('data', d => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });

  async function manifest() {
    const meta = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, 'utf8')) : {};
    const files = readdirSync(packDir).filter(f => f.toLowerCase().endsWith('.scs') || f.toLowerCase().endsWith('.zip'));
    const mods = [];
    for (const file of files) {
      const full = path.join(packDir, file);
      const { size, mtimeMs } = statSync(full);
      let cached = hashes.get(file);
      if (!cached || cached.mtimeMs !== mtimeMs) {
        cached = { mtimeMs, sha256: await hashFile(full) };
        hashes.set(file, cached);
      }
      mods.push({ file, size, sha256: cached.sha256, ...(meta.mods?.[file] ?? {}) });
    }
    return { version: meta.version ?? '1', name: meta.name ?? 'Mod pack', mods };
  }

  return { packDir, manifest };
}
