import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PackManifestEntry } from '@/data/types';
import type { ActivePack, PackLoadStage } from '@/data/pack-runtime';
import { loadManifest, loadActivePack, peekSessionCachedPack } from '@/data/pack-registry';
import { buildTagIndexFromMeta } from '@/lib/tag-index';
import { readPersistedActiveEntry } from '@/lib/pack-persist';

export type PackRestoreState = 'idle' | 'restoring' | 'ready';

const initialActiveEntry = readPersistedActiveEntry();

interface PackState {
  manifest: PackManifestEntry[];
  activePack: ActivePack | null;
  activeEntry: PackManifestEntry | null;
  loadStage: PackLoadStage | null;
  restoreState: PackRestoreState;
  loading: boolean;
  error: string | null;
  loadManifestList: () => Promise<void>;
  selectPack: (entry: PackManifestEntry, options?: { silent?: boolean }) => Promise<void>;
  attachPack: (entry: PackManifestEntry, pack: ActivePack) => void;
}

export const usePackStore = create<PackState>()(
  persist(
    (set) => ({
      manifest: [],
      activePack: null,
      activeEntry: initialActiveEntry,
      loadStage: null,
      restoreState: initialActiveEntry ? 'idle' : 'idle',
      loading: false,
      error: null,

      loadManifestList: async () => {
        set({ loading: true, error: null });
        try {
          const m = await loadManifest();
          set({ manifest: m.packs, loading: false });
        } catch (e) {
          set({
            loading: false,
            error: e instanceof Error ? e.message : 'Unknown error',
          });
        }
      },

      attachPack: (entry, pack) => {
        queueMicrotask(() => {
          buildTagIndexFromMeta(pack);
        });
        set({
          activePack: pack,
          activeEntry: entry,
          loading: false,
          loadStage: 'ready',
          restoreState: 'ready',
          error: null,
        });
      },

      selectPack: async (entry, options) => {
        const silent = options?.silent ?? false;
        const cached = peekSessionCachedPack(entry);
        if (cached) {
          usePackStore.getState().attachPack(entry, cached);
          return;
        }

        set({
          loading: !silent,
          restoreState: 'idle',
          error: null,
          loadStage: 'meta',
        });
        try {
          const pack = await loadActivePack(entry);
          queueMicrotask(() => {
            buildTagIndexFromMeta(pack);
          });
          set({
            activePack: pack,
            activeEntry: entry,
            loading: false,
            loadStage: 'ready',
            restoreState: 'ready',
          });
        } catch (e) {
          set({
            loading: false,
            loadStage: null,
            restoreState: 'idle',
            error: e instanceof Error ? e.message : 'Unknown error',
          });
        }
      },
    }),
    {
      name: 'tfg-pack-store',
      partialize: (s) => ({
        activeEntry: s.activeEntry,
      }),
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as object),
        activeEntry:
          (persisted as { activeEntry?: PackManifestEntry | null }).activeEntry ??
          current.activeEntry,
      }),
    },
  ),
);
