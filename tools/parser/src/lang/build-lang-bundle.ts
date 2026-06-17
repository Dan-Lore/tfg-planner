import type { ModIndex } from '../types.js';
import { loadKubeJsLang } from './load-kubejs.js';
import { loadModJarLangs } from './load-jar-langs.js';
import { loadMinecraftLang } from './load-minecraft-lang.js';
import { emptyLangBundle, mergeLangBundle } from './merge.js';
import type { LangBundle, LangStats } from './types.js';

export interface BuildLangBundleOptions {
  downloadModJars?: boolean;
  jarConcurrency?: number;
}

export async function buildLangBundle(
  modpackRoot: string,
  modIndex: ModIndex,
  cacheDir: string,
  options?: BuildLangBundleOptions,
): Promise<{ bundle: LangBundle; stats: LangStats }> {
  const minecraftLayer = await loadMinecraftLang(modIndex.mcVersion, cacheDir);
  const jarLayer = await loadModJarLangs(modIndex, cacheDir, {
    download: options?.downloadModJars ?? true,
    concurrency: options?.jarConcurrency ?? 8,
  });
  const kubejsLayer = loadKubeJsLang(modpackRoot);

  const bundle = emptyLangBundle();
  mergeLangBundle(bundle, minecraftLayer);
  mergeLangBundle(bundle, jarLayer.bundle);
  mergeLangBundle(bundle, kubejsLayer.bundle);

  return {
    bundle,
    stats: {
      kubejsFiles: kubejsLayer.fileCount,
      modJars: jarLayer.jarCount,
      minecraftKeysRu: Object.keys(minecraftLayer.ru).length,
      minecraftKeysEn: Object.keys(minecraftLayer.en).length,
      keysRu: Object.keys(bundle.ru).length,
      keysEn: Object.keys(bundle.en).length,
    },
  };
}

export { emptyLangBundle };
