import { publicPath } from '@/lib/public-path';
import { ProductLexicon, type PackLangArtifact } from '@/lib/product-lexicon';
import type { PackBuildManifest } from '@/lib/pack-build-manifest';
import type { PackManifestEntry } from './types';
import {
  decompressGzipJson,
  readLangArtifactFromCache,
  writeLangArtifactToCache,
} from './lang-cache';

const memoryCache = new Map<string, ProductLexicon>();

function lexiconKey(
  modpackVersion: string,
  dataVersion: number,
  langSha256: string,
): string {
  return `${modpackVersion}:${dataVersion}:${langSha256}`;
}

export type LangFetch = (url: string) => Promise<ArrayBuffer>;

const defaultLangFetch: LangFetch = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.arrayBuffer();
};

export async function loadPackLangArtifact(
  entry: PackManifestEntry,
  buildManifest: PackBuildManifest,
  fetchLang: LangFetch = defaultLangFetch,
): Promise<PackLangArtifact | null> {
  const langPath = buildManifest.langPath ?? entry.langPath;
  const langSha256 = buildManifest.langSha256 ?? entry.langSha256;
  if (!langPath || !langSha256) return null;

  const cached = await readLangArtifactFromCache(
    entry.modpackVersion,
    entry.dataVersion,
    langSha256,
  );
  if (cached) return cached;

  const url = publicPath(`/data/packs/${entry.modpackVersion}/${langPath}`);
  const bytes = await fetchLang(url);
  const artifact = await decompressGzipJson<PackLangArtifact>(bytes);
  if (
    artifact.format !== 'tfg-pack-lang' ||
    artifact.modpackVersion !== entry.modpackVersion ||
    artifact.dataVersion !== entry.dataVersion
  ) {
    throw new Error(`Pack lang artifact mismatch for ${entry.modpackVersion}`);
  }

  void writeLangArtifactToCache(
    entry.modpackVersion,
    entry.dataVersion,
    langSha256,
    artifact,
  );
  return artifact;
}

export async function ensurePackLexicon(
  entry: PackManifestEntry,
  buildManifest: PackBuildManifest,
  fetchLang?: LangFetch,
): Promise<ProductLexicon | null> {
  const langSha256 = buildManifest.langSha256 ?? entry.langSha256;
  if (!langSha256) return null;

  const key = lexiconKey(entry.modpackVersion, entry.dataVersion, langSha256);
  const hit = memoryCache.get(key);
  if (hit) return hit;

  const artifact = await loadPackLangArtifact(entry, buildManifest, fetchLang);
  if (!artifact) return null;

  const lexicon = ProductLexicon.fromArtifact(artifact);
  memoryCache.set(key, lexicon);
  return lexicon;
}

export function peekPackLexicon(
  modpackVersion: string,
  dataVersion: number,
  langSha256: string,
): ProductLexicon | null {
  return memoryCache.get(lexiconKey(modpackVersion, dataVersion, langSha256)) ?? null;
}

export function clearPackLexiconMemoryCache(): void {
  memoryCache.clear();
}
