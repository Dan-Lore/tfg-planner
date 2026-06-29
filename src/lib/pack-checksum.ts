import type { PackMeta } from '@/data/types';

/** Canonical meta payload — must match tools/parser build-pack manifest checksum input. */
export function canonicalPackMetaJson(meta: PackMeta): string {
  return JSON.stringify({
    format: meta.format,
    formatVersion: meta.formatVersion,
    modpackVersion: meta.modpackVersion,
    dataVersion: meta.dataVersion,
    generatedAt: meta.generatedAt,
    machines: meta.machines,
    items: meta.items,
    fluids: meta.fluids,
  });
}

/** Same algorithm as tools/parser build-pack (sha256 hex, first 16 chars). */
export async function checksumUtf8(content: string): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const bytes = new TextEncoder().encode(content);
  const digest = await subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}

export async function checksumPackMeta(meta: PackMeta): Promise<string | null> {
  return checksumUtf8(canonicalPackMetaJson(meta));
}
