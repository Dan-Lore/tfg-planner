import type { PackManifestEntry } from '@/data/types';

const PACK_STORE_KEY = 'tfg-pack-store';

/** Sync read before zustand persist finishes — avoids «not selected» flash on F5. */
export function readPersistedActiveEntry(): PackManifestEntry | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PACK_STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      state?: { activeEntry?: PackManifestEntry | null };
    };
    return parsed.state?.activeEntry ?? null;
  } catch {
    return null;
  }
}
