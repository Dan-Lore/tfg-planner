#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import AdmZip from 'adm-zip';

const tag = process.argv[2] ?? '0.12.8';
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const cacheDir = join(repoRoot, '.cache');
const REPO = 'TerraFirmaGreg-Team/Modpack-Modern';

function cacheKey(t) {
  return createHash('sha256').update(`${REPO}@${t}`).digest('hex').slice(0, 16);
}

const base = join(cacheDir, 'modpack', cacheKey(tag));
const rootDir = join(base, `Modpack-Modern-${tag}`);
const marker = join(base, '.fetched');

if (existsSync(marker) && existsSync(rootDir)) {
  console.log(`Modpack ${tag} already cached at ${rootDir}`);
  process.exit(0);
}

mkdirSync(base, { recursive: true });
const zipPath = join(base, `${tag}.zip`);
const archiveUrl = `https://github.com/${REPO}/archive/refs/tags/${tag}.zip`;

const res = await fetch(archiveUrl);
if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
await pipeline(Readable.fromWeb(res.body), createWriteStream(zipPath));

if (existsSync(rootDir)) rmSync(rootDir, { recursive: true, force: true });
new AdmZip(zipPath).extractAllTo(base, true);
writeFileSync(marker, new Date().toISOString());
console.log(`Fetched modpack ${tag} → ${rootDir}`);
