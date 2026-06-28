import { useEffect, useState } from 'react';
import { usePackStore } from '@/stores/pack-store';
import { useEditorStore } from '@/stores/editor-store';

/** Auto-select persisted or default pack once manifest and editor storage are ready. */
export function usePackBootstrap(): void {
  const manifest = usePackStore((s) => s.manifest);
  const loadManifestList = usePackStore((s) => s.loadManifestList);
  const selectPack = usePackStore((s) => s.selectPack);
  const switchToPack = useEditorStore((s) => s.switchToPack);
  const [editorHydrated, setEditorHydrated] = useState(
    () => useEditorStore.persist.hasHydrated(),
  );

  useEffect(() => {
    return useEditorStore.persist.onFinishHydration(() => setEditorHydrated(true));
  }, []);

  useEffect(() => {
    void loadManifestList();
  }, [loadManifestList]);

  useEffect(() => {
    if (!editorHydrated || manifest.length === 0) return;

    const state = usePackStore.getState();
    const persisted = state.activeEntry;
    const persistedOk =
      persisted &&
      manifest.some(
        (e) =>
          e.modpackVersion === persisted.modpackVersion && e.status !== 'deprecated',
      );

    const entry =
      persistedOk
        ? persisted!
        : manifest.find((e) => e.status === 'ready') ?? manifest[0];

    if (!entry) return;

    const needsLoad =
      !state.activePack ||
      state.activeEntry?.modpackVersion !== entry.modpackVersion;

    if (needsLoad) {
      void selectPack(entry).then(() => {
        switchToPack(entry.modpackVersion, entry.dataVersion);
      });
    }
  }, [editorHydrated, manifest, selectPack, switchToPack]);
}
