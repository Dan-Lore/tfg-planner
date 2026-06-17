import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import AdmZip from 'adm-zip';
import { downloadFile } from '../fetch/modpack-fetch.js';
import { emptyLangBundle, mergeLangBundle } from './merge.js';
import type { LangBundle } from './types.js';

interface VersionManifest {
  versions: { id: string; url: string }[];
}

interface VersionDetails {
  downloads: { client?: { url: string } };
  assetIndex: { url: string };
}

interface AssetIndex {
  objects: Record<string, { hash: string; size: number }>;
}

const MANIFEST_URL = 'https://launchermeta.mojang.com/mc/game/version_manifest_v2.json';

function assetObjectUrl(hash: string): string {
  return `https://resources.download.minecraft.net/${hash.slice(0, 2)}/${hash}`;
}

async function fetchVersionDetails(mcVersion: string): Promise<VersionDetails> {
  const manifestRes = await fetch(MANIFEST_URL);
  if (!manifestRes.ok) {
    throw new Error(`Failed to fetch Minecraft version manifest: ${manifestRes.status}`);
  }
  const manifest = (await manifestRes.json()) as VersionManifest;
  const version = manifest.versions.find((v) => v.id === mcVersion);
  if (!version) {
    throw new Error(`Minecraft version ${mcVersion} not found in manifest`);
  }
  const versionRes = await fetch(version.url);
  if (!versionRes.ok) {
    throw new Error(`Failed to fetch Minecraft version metadata: ${versionRes.status}`);
  }
  return (await versionRes.json()) as VersionDetails;
}

async function loadAssetIndex(details: VersionDetails): Promise<AssetIndex> {
  const res = await fetch(details.assetIndex.url);
  if (!res.ok) {
    throw new Error(`Failed to fetch Minecraft asset index: ${res.status}`);
  }
  return (await res.json()) as AssetIndex;
}

async function loadLangFromAssetIndex(
  assetIndex: AssetIndex,
  objectPath: string,
  cachePath: string,
): Promise<Record<string, string> | undefined> {
  if (existsSync(cachePath)) {
    return JSON.parse(readFileSync(cachePath, 'utf-8')) as Record<string, string>;
  }
  const obj = assetIndex.objects[objectPath];
  if (!obj) return undefined;
  await downloadFile(assetObjectUrl(obj.hash), cachePath);
  return JSON.parse(readFileSync(cachePath, 'utf-8')) as Record<string, string>;
}

export async function loadMinecraftLang(
  mcVersion: string,
  cacheDir: string,
): Promise<LangBundle> {
  const bundle = emptyLangBundle();
  const cacheBase = join(cacheDir, 'minecraft');
  mkdirSync(cacheBase, { recursive: true });
  const jarPath = join(cacheBase, `client-${mcVersion}.jar`);
  const fetchedMarker = join(cacheBase, `.fetched-${mcVersion}`);

  try {
    const details = await fetchVersionDetails(mcVersion);

    if (!existsSync(jarPath)) {
      const clientUrl = details.downloads.client?.url;
      if (!clientUrl) {
        throw new Error(`No client download for Minecraft ${mcVersion}`);
      }
      await downloadFile(clientUrl, jarPath);
    }

    const zip = new AdmZip(jarPath);
    for (const locale of ['ru_ru', 'en_us'] as const) {
      const entry = zip.getEntry(`assets/minecraft/lang/${locale}.json`);
      if (!entry) continue;
      const parsed = JSON.parse(entry.getData().toString('utf-8')) as Record<string, string>;
      if (locale === 'ru_ru') mergeLangBundle(bundle, { ru: parsed, en: {} });
      else mergeLangBundle(bundle, { ru: {}, en: parsed });
    }

    if (Object.keys(bundle.ru).length === 0) {
      const assetIndex = await loadAssetIndex(details);
      const ru = await loadLangFromAssetIndex(
        assetIndex,
        'minecraft/lang/ru_ru.json',
        join(cacheBase, `ru_ru-${mcVersion}.json`),
      );
      if (ru) mergeLangBundle(bundle, { ru, en: {} });
    }

    if (Object.keys(bundle.en).length === 0) {
      const assetIndex = await loadAssetIndex(details);
      const en = await loadLangFromAssetIndex(
        assetIndex,
        'minecraft/lang/en_us.json',
        join(cacheBase, `en_us-${mcVersion}.json`),
      );
      if (en) mergeLangBundle(bundle, { ru: {}, en });
    }

    writeFileSync(fetchedMarker, new Date().toISOString());
  } catch (e) {
    if (existsSync(fetchedMarker)) {
      return bundle;
    }
    throw e;
  }

  return bundle;
}

export function readCachedMinecraftVersion(cacheDir: string, mcVersion: string): boolean {
  return existsSync(join(cacheDir, 'minecraft', `.fetched-${mcVersion}`));
}
