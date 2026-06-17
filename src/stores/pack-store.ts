import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PackData, PackManifestEntry } from '@/data/types';
import { loadManifest, loadPackData } from '@/data/pack-registry';

interface PackState {
  manifest: PackManifestEntry[];
  activePack: PackData | null;
  activeEntry: PackManifestEntry | null;
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
        set({ loading: true, error: null });
        try {
          const pack = await loadPackData(entry.path);
          set({
            activePack: pack,
            activeEntry: entry,
            loading: false,
          });
        } catch (e) {
          set({
            loading: false,
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
