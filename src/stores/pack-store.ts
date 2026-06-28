import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PackManifestEntry } from '@/data/types';
import type { ActivePack, PackLoadStage } from '@/data/pack-runtime';
import { loadManifest, loadActivePack } from '@/data/pack-registry';

interface PackState {
  manifest: PackManifestEntry[];
  activePack: ActivePack | null;
  activeEntry: PackManifestEntry | null;
  loadStage: PackLoadStage | null;
  loading: boolean;
  error: string | null;
  loadManifestList: () => Promise<void>;
  selectPack: (entry: PackManifestEntry) => Promise<void>;
}

export const usePackStore = create<PackState>()(
  persist(
    (set) => ({
      manifest: [],
      activePack: null,
      activeEntry: null,
      loadStage: null,
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

      selectPack: async (entry) => {
        set({ loading: true, error: null, loadStage: 'meta' });
        try {
          const pack = await loadActivePack(entry);
          set({
            activePack: pack,
            activeEntry: entry,
            loading: false,
            loadStage: 'ready',
          });
        } catch (e) {
          set({
            loading: false,
            loadStage: null,
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
    },
  ),
);
