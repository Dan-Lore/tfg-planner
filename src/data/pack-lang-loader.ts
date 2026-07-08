import { publicPath } from '@/lib/public-path';
import { ProductLexicon, type PackLangArtifact } from '@/lib/product-lexicon';
import type { PackBuildManifest } from '@/lib/pack-build-manifest';
import type { PackManifestEntry } from './types';
import {
  parsePackLangArtifactBytes,
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

  // #region agent log
  fetch('http://127.0.0.1:7815/ingest/a4c01786-6c76-4f15-8a5b-7527ced6c773',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b5b3c4'},body:JSON.stringify({sessionId:'b5b3c4',location:'pack-lang-loader.ts:loadPackLangArtifact:start',message:'lang load start',data:{modpackVersion:entry.modpackVersion,langPath,langSha256,entryLangSha256:entry.langSha256,buildLangSha256:buildManifest.langSha256,baseUrl:import.meta.env.BASE_URL},timestamp:Date.now(),hypothesisId:'H1-H5'})}).catch(()=>{});
  // #endregion

  let cached: PackLangArtifact | null = null;
  try {
    cached = await readLangArtifactFromCache(
      entry.modpackVersion,
      entry.dataVersion,
      langSha256,
    );
  } catch (cacheErr) {
    // #region agent log
    fetch('http://127.0.0.1:7815/ingest/a4c01786-6c76-4f15-8a5b-7527ced6c773',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b5b3c4'},body:JSON.stringify({sessionId:'b5b3c4',location:'pack-lang-loader.ts:idb-read-error',message:'IndexedDB read failed',data:{error:String(cacheErr)},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
    // #endregion
    throw cacheErr;
  }
  if (cached) {
    // #region agent log
    fetch('http://127.0.0.1:7815/ingest/a4c01786-6c76-4f15-8a5b-7527ced6c773',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b5b3c4'},body:JSON.stringify({sessionId:'b5b3c4',location:'pack-lang-loader.ts:cache-hit',message:'lang cache hit',data:{modpackVersion:entry.modpackVersion},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
    // #endregion
    return cached;
  }

  const url = publicPath(`/data/packs/${entry.modpackVersion}/${langPath}`);
  // #region agent log
  fetch('http://127.0.0.1:7815/ingest/a4c01786-6c76-4f15-8a5b-7527ced6c773',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b5b3c4'},body:JSON.stringify({sessionId:'b5b3c4',location:'pack-lang-loader.ts:before-fetch',message:'fetching lang artifact',data:{url,origin:typeof location!=='undefined'?location.origin:null},timestamp:Date.now(),hypothesisId:'H1-H2'})}).catch(()=>{});
  // #endregion
  let bytes: ArrayBuffer;
  try {
    bytes = await fetchLang(url);
  } catch (fetchErr) {
    const errData = {
      url,
      errorName: fetchErr instanceof Error ? fetchErr.name : 'unknown',
      errorMessage: fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
    };
    // #region agent log
    console.warn('[debug-b5b3c4] lang fetch failed', errData);
    fetch('http://127.0.0.1:7815/ingest/a4c01786-6c76-4f15-8a5b-7527ced6c773',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b5b3c4'},body:JSON.stringify({sessionId:'b5b3c4',location:'pack-lang-loader.ts:fetch-error',message:'lang fetch failed',data:errData,timestamp:Date.now(),hypothesisId:'H1-H2-H4'})}).catch(()=>{});
    // #endregion
    throw fetchErr;
  }
  // #region agent log
  const gzipMagic = new Uint8Array(bytes).length >= 2 && new Uint8Array(bytes)[0] === 0x1f;
  fetch('http://127.0.0.1:7815/ingest/a4c01786-6c76-4f15-8a5b-7527ced6c773',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b5b3c4'},body:JSON.stringify({sessionId:'b5b3c4',location:'pack-lang-loader.ts:after-fetch',message:'lang fetch ok',data:{url,byteLength:bytes.byteLength,gzipMagic},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
  // #endregion
  let artifact: PackLangArtifact;
  try {
    artifact = await parsePackLangArtifactBytes<PackLangArtifact>(bytes);
  } catch (parseErr) {
    const parseData = {
      url,
      byteLength: bytes.byteLength,
      gzipMagic,
      errorMessage: parseErr instanceof Error ? parseErr.message : String(parseErr),
    };
    // #region agent log
    console.warn('[debug-b5b3c4] lang parse failed', parseData);
    fetch('http://127.0.0.1:7815/ingest/a4c01786-6c76-4f15-8a5b-7527ced6c773',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b5b3c4'},body:JSON.stringify({sessionId:'b5b3c4',location:'pack-lang-loader.ts:parse-error',message:'lang parse failed',data:parseData,timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
    // #endregion
    throw parseErr;
  }
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
