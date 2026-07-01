import { usePackStore } from '@/stores/pack-store';
import { useEditorStore } from '@/stores/editor-store';
import { packEntryNeedsLoad, resolvePackEntry } from '@/lib/resolve-pack-entry';
import { readPersistedActiveEntry } from '@/lib/pack-persist';
import type { PackManifestEntry } from '@/data/types';
import { packKey } from '@/lib/pack-key';
import { isEntryAlignedWithEditor } from '@/lib/pack-selection';

type PersistStore = {
  persist: {
    hasHydrated: () => boolean;
    onFinishHydration: (fn: () => void) => () => void;
  };
};

function waitForEditorHydration(): Promise<void> {
  const store = useEditorStore as unknown as PersistStore;
  if (store.persist.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      unsub();
      resolve();
    };
    const unsub = store.persist.onFinishHydration(done);
    if (store.persist.hasHydrated()) done();
  });
}

let ensurePromise: Promise<void> | null = null;

/** Sync editor scheme cache with pack — never reset scheme when key already matches. */
async function syncEditorToPack(entry: PackManifestEntry): Promise<void> {
  await waitForEditorHydration();

  const key = packKey(entry.modpackVersion, entry.dataVersion);
  const { activePackKey, schemesByPack, switchToPack } =
    useEditorStore.getState();

  if (activePackKey === key) {
    const editor = useEditorStore.getState();
    if (
      !editor.flowResult &&
      editor.scheme.nodes.length > 0 &&
      usePackStore.getState().activePack
    ) {
      editor.updateFlows();
    } else if (editor.flowResult && usePackStore.getState().activePack) {
      editor.refreshSchemeCheck();
    }
    return;
  }

  if (schemesByPack[key] || activePackKey === null) {
    switchToPack(entry.modpackVersion, entry.dataVersion);
  }
}

function resolveActiveEntry(): PackManifestEntry | null {
  const fromStore = usePackStore.getState().activeEntry;
  if (fromStore) return fromStore;
  const persisted = readPersistedActiveEntry();
  if (persisted) {
    usePackStore.setState({ activeEntry: persisted });
    return persisted;
  }
  return null;
}

/**
 * Restore in-memory pack runtime after F5 (activeEntry is persisted; pack meta is not).
 * Does not touch editor scheme when activePackKey already matches.
 */
export async function ensureActivePackReady(): Promise<void> {
  let { manifest, activePack, selectPack } = usePackStore.getState();
  if (manifest.length === 0) {
    await usePackStore.getState().loadManifestList();
    manifest = usePackStore.getState().manifest;
  }
  if (manifest.length === 0) return;

  const activeEntry = resolveActiveEntry();
  if (!activeEntry) return;

  const entry = resolvePackEntry(activeEntry, manifest);
  if (!entry) return;

  const needsLoad = packEntryNeedsLoad(entry, activePack, activeEntry);
  const editorKey = useEditorStore.getState().activePackKey;
  const selectionAligned = isEntryAlignedWithEditor(entry, editorKey);

  if (needsLoad) {
    if (selectionAligned) {
      usePackStore.setState({ restoreState: 'idle' });
    }
    await selectPack(entry, { silent: true });
    if (!usePackStore.getState().activePack) return;
  }

  await syncEditorToPack(entry);
  usePackStore.setState({ restoreState: 'ready' });
}

export function scheduleEnsureActivePackReady(source = 'unknown'): void {
  if (ensurePromise) {
    void ensurePromise.finally(() => {
      const { activeEntry, activePack } = usePackStore.getState();
      if (activeEntry && !activePack) {
        scheduleEnsureActivePackReady(`${source}-retry`);
      }
    });
    return;
  }
  ensurePromise = ensureActivePackReady().finally(() => {
    ensurePromise = null;
  });
  void ensurePromise;
}

/** @deprecated use scheduleEnsureActivePackReady */
export function scheduleRestoreActivePack(source = 'unknown'): void {
  scheduleEnsureActivePackReady(source);
}

export function initPackRestore(): void {
  useEditorStore.persist.onFinishHydration(() => {
    const { activeEntry, activePack, manifest } = usePackStore.getState();
    if (!activeEntry || !activePack || manifest.length === 0) return;
    const entry = resolvePackEntry(activeEntry, manifest);
    if (entry) void syncEditorToPack(entry);
  });
}
