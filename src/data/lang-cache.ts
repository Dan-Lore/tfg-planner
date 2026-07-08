import type { PackLangArtifact } from '@/lib/product-lexicon';

const DB_NAME = 'tfg-pack-lang';
const DB_VERSION = 1;
const STORE = 'artifacts';

function cacheKey(modpackVersion: string, dataVersion: number, langSha256: string): string {
  return `${modpackVersion}:${dataVersion}:${langSha256}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

export async function readLangArtifactFromCache(
  modpackVersion: string,
  dataVersion: number,
  langSha256: string,
): Promise<PackLangArtifact | null> {
  if (typeof indexedDB === 'undefined') return null;
  const key = cacheKey(modpackVersion, dataVersion, langSha256);
  const db = await openDb();
  try {
    return await new Promise<PackLangArtifact | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const req = store.get(key);
      req.onsuccess = () => resolve((req.result as PackLangArtifact | undefined) ?? null);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB read failed'));
    });
  } finally {
    db.close();
  }
}

export async function writeLangArtifactToCache(
  modpackVersion: string,
  dataVersion: number,
  langSha256: string,
  artifact: PackLangArtifact,
): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const key = cacheKey(modpackVersion, dataVersion, langSha256);
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      store.put(artifact, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
    });
  } finally {
    db.close();
  }
}

function isGzipBytes(bytes: ArrayBuffer): boolean {
  const u8 = new Uint8Array(bytes);
  return u8.length >= 2 && u8[0] === 0x1f && u8[1] === 0x8b;
}

export async function decompressGzipJson<T>(bytes: ArrayBuffer): Promise<T> {
  if (typeof DecompressionStream !== 'undefined') {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const text = await new Response(stream).text();
    return JSON.parse(text) as T;
  }
  throw new Error('Gzip decompression is not supported in this browser');
}

/** Parse pack.lang bytes: raw gzip (prod) or JSON already decompressed by Content-Encoding (dev). */
export async function parsePackLangArtifactBytes<T>(bytes: ArrayBuffer): Promise<T> {
  if (isGzipBytes(bytes)) {
    return decompressGzipJson<T>(bytes);
  }
  const text = new TextDecoder().decode(bytes);
  return JSON.parse(text) as T;
}
