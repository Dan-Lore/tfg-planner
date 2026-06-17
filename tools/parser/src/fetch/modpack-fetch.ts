import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import AdmZip from 'adm-zip';

const REPO = 'TerraFirmaGreg-Team/Modpack-Modern';

export interface ModpackSnapshot {
  tag: string;
  rootDir: string;
  fetchedAt: string;
  archiveUrl: string;
}

function cacheKey(tag: string): string {
  return createHash('sha256').update(`${REPO}@${tag}`).digest('hex').slice(0, 16);
}

export function getModpackRoot(cacheDir: string, tag: string): string {
  return join(cacheDir, 'modpack', cacheKey(tag), 'Modpack-Modern-' + tag);
}

export async function fetchModpackTag(
  tag: string,
  cacheDir: string,
): Promise<ModpackSnapshot> {
  const base = join(cacheDir, 'modpack', cacheKey(tag));
  const rootDir = join(base, `Modpack-Modern-${tag}`);
  const marker = join(base, '.fetched');
  const archiveUrl = `https://github.com/${REPO}/archive/refs/tags/${tag}.zip`;

  if (existsSync(marker) && existsSync(rootDir)) {
    const fetchedAt = readFileSync(marker, 'utf-8').trim();
    return { tag, rootDir, fetchedAt, archiveUrl };
  }

  mkdirSync(base, { recursive: true });
  const zipPath = join(base, `${tag}.zip`);

  const res = await fetch(archiveUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch modpack tag ${tag}: ${res.status} ${res.statusText}`);
  }
  const body = res.body;
  if (!body) throw new Error('Empty response body');
  await pipeline(Readable.fromWeb(body as import('node:stream/web').ReadableStream), createWriteStream(zipPath));

  if (existsSync(rootDir)) {
    rmSync(rootDir, { recursive: true, force: true });
  }

  const zip = new AdmZip(zipPath);
  zip.extractAllTo(base, true);

  const fetchedAt = new Date().toISOString();
  writeFileSync(marker, fetchedAt);

  return { tag, rootDir, fetchedAt, archiveUrl };
}

export async function downloadFile(url: string, dest: string): Promise<void> {
  mkdirSync(join(dest, '..'), { recursive: true });
  if (existsSync(dest)) return;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${url}: ${res.status}`);
  const body = res.body;
  if (!body) throw new Error('Empty body');
  await pipeline(Readable.fromWeb(body as import('node:stream/web').ReadableStream), createWriteStream(dest));
}
