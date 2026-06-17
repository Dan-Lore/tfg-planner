import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ModIndex, ModIndexEntry } from '../types.js';

interface PakkuFile {
  file_name: string;
  url: string;
  mc_versions?: string[];
}

interface PakkuProject {
  slug?: { curseforge?: string; modrinth?: string };
  files: PakkuFile[];
}

interface PakkuLock {
  mc_versions: string[];
  projects: PakkuProject[];
}

function versionFromFileName(fileName: string): string {
  const m = fileName.match(/-(\d+\.\d+(?:\.\d+)?(?:[-+][\w.]+)?)\.jar$/i);
  return m?.[1] ?? fileName;
}

function pickFile(project: PakkuProject, mcVersion: string): PakkuFile | undefined {
  const modrinth = project.files.find((f) => f.url.includes('modrinth.com'));
  const forge = project.files.find((f) => f.mc_versions?.includes(mcVersion));
  return modrinth ?? forge ?? project.files[0];
}

export function parsePakkuLock(lockPath: string): PakkuLock {
  return JSON.parse(readFileSync(lockPath, 'utf-8')) as PakkuLock;
}

export function buildModIndex(
  modpackRoot: string,
  tag: string,
  outDir?: string,
): ModIndex {
  const lock = parsePakkuLock(join(modpackRoot, 'pakku-lock.json'));
  const mcVersion = lock.mc_versions[0] ?? '1.20.1';
  const mods: ModIndexEntry[] = [];

  for (const project of lock.projects) {
    const file = pickFile(project, mcVersion);
    if (!file) continue;
    const slug =
      project.slug?.modrinth ??
      project.slug?.curseforge ??
      file.file_name.replace(/\.jar$/, '');
    mods.push({
      slug,
      fileName: file.file_name,
      version: versionFromFileName(file.file_name),
      url: file.url,
    });
  }

  const index: ModIndex = {
    generatedAt: new Date().toISOString(),
    tag,
    mcVersion,
    mods,
  };

  if (outDir) {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'mods.index.json'), JSON.stringify(index, null, 2));
  }

  return index;
}

export function findMod(index: ModIndex, pattern: RegExp): ModIndexEntry | undefined {
  return index.mods.find((m) => pattern.test(m.fileName) || pattern.test(m.slug));
}
