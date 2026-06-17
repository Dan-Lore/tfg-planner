import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import AdmZip from 'adm-zip';
import type { ModIndex } from '../types.js';
import { downloadFile } from '../fetch/modpack-fetch.js';
import { emptyLangBundle, mergeLangBundle } from './merge.js';
import type { LangBundle } from './types.js';

function extractLangFromArchive(archivePath: string): LangBundle {
  const bundle = emptyLangBundle();
  try {
    const zip = new AdmZip(archivePath);

    for (const entry of zip.getEntries()) {
      const name = entry.entryName.replace(/\\/g, '/');
      const m = name.match(/^assets\/[^/]+\/lang\/(ru_ru|en_us)\.json$/);
      if (!m) continue;
      const base = `${m[1]}.json`;

      try {
        const parsed = JSON.parse(entry.getData().toString('utf-8')) as Record<string, string>;
        if (base === 'ru_ru.json') mergeLangBundle(bundle, { ru: parsed, en: {} });
        else mergeLangBundle(bundle, { ru: {}, en: parsed });
      } catch {
        /* skip malformed lang entry */
      }
    }
  } catch {
    /* skip corrupt jar/zip */
  }

  return bundle;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker(): Promise<void> {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]!);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/** Load lang files from mod JARs and zip archives listed in pakku-lock (base layer, before kubejs overrides). */
export async function loadModJarLangs(
  modIndex: ModIndex,
  cacheDir: string,
  options?: { download?: boolean; concurrency?: number },
): Promise<{ bundle: LangBundle; jarCount: number }> {
  const jarDir = join(cacheDir, 'mods');
  mkdirSync(jarDir, { recursive: true });
  const download = options?.download ?? true;
  const concurrency = options?.concurrency ?? 8;
  const bundle = emptyLangBundle();
  let jarCount = 0;

  await mapWithConcurrency(modIndex.mods, concurrency, async (mod) => {
    const archivePath = join(jarDir, mod.fileName);
    if (!existsSync(archivePath) && download) {
      try {
        await downloadFile(mod.url, archivePath);
      } catch {
        return;
      }
    }
    if (!existsSync(archivePath)) return;

    const layer = extractLangFromArchive(archivePath);
    const hasKeys = Object.keys(layer.ru).length > 0 || Object.keys(layer.en).length > 0;
    if (!hasKeys) return;

    jarCount++;
    mergeLangBundle(bundle, layer);
  });

  return { bundle, jarCount };
}
