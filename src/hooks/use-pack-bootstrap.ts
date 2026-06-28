import { useEffect, useState } from 'react';
import { usePackStore } from '@/stores/pack-store';
import { useEditorStore } from '@/stores/editor-store';
import { packEntryNeedsLoad, resolvePackEntry } from '@/lib/resolve-pack-entry';

/** Auto-select persisted or default pack once manifest and editor storage are ready. */
export function usePackBootstrap(): void {
  const manifest = usePackStore((s) => s.manifest);
  const loadManifestList = usePackStore((s) => s.loadManifestList);
  const selectPack = usePackStore((s) => s.selectPack);
  const switchToPack = useEditorStore((s) => s.switchToPack);
  const [editorHydrated, setEditorHydrated] = useState(
    () => useEditorStore.persist.hasHydrated(),
  );
  const [packHydrated, setPackHydrated] = useState(
    () => usePackStore.persist.hasHydrated(),
  );

  useEffect(() => {
    return useEditorStore.persist.onFinishHydration(() => setEditorHydrated(true));
  }, []);

  useEffect(() => {
    return usePackStore.persist.onFinishHydration(() => setPackHydrated(true));
  }, []);

  useEffect(() => {
    void loadManifestList();
  }, [loadManifestList]);

  useEffect(() => {
    if (!editorHydrated || !packHydrated || manifest.length === 0) return;

    const state = usePackStore.getState();
    const entry = resolvePackEntry(state.activeEntry, manifest);
    if (!entry) return;

    if (!packEntryNeedsLoad(entry, state.activePack, state.activeEntry)) return;

    void selectPack(entry).then(() => {
      switchToPack(entry.modpackVersion, entry.dataVersion);
    });
  }, [editorHydrated, packHydrated, manifest, selectPack, switchToPack]);
}
