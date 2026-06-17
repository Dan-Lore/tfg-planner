import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PackManifestEntry } from '@/data/types';
import { usePackStore } from '@/stores/pack-store';
import { useEditorStore } from '@/stores/editor-store';

export function VersionSidebar() {
  const { t } = useTranslation();
  const manifest = usePackStore((s) => s.manifest);
  const activeEntry = usePackStore((s) => s.activeEntry);
  const activePack = usePackStore((s) => s.activePack);
  const loading = usePackStore((s) => s.loading);
  const error = usePackStore((s) => s.error);
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

  const handleSelect = (entry: PackManifestEntry) => {
    if (activeEntry?.modpackVersion === entry.modpackVersion) return;
    void selectPack(entry).then(() => {
      switchToPack(entry.modpackVersion, entry.dataVersion);
    });
  };

  return (
    <aside className="version-sidebar">
      <h2 className="version-sidebar__title">{t('versions.title')}</h2>
      {error && <div className="version-sidebar__error">{error}</div>}
      {loading && manifest.length === 0 && (
        <p className="version-sidebar__muted">…</p>
      )}
      {manifest.length === 0 && !loading && (
        <p className="version-sidebar__muted">{t('versions.noPacks')}</p>
      )}
      <ul className="version-list">
        {manifest.map((entry) => {
          const isActive =
            activeEntry?.modpackVersion === entry.modpackVersion;
          return (
            <li key={entry.modpackVersion}>
              <button
                type="button"
                className={`version-item ${isActive ? 'version-item--active' : ''}`}
                disabled={loading}
                onClick={() => handleSelect(entry)}
              >
                <span className="version-item__name">{entry.modpackVersion}</span>
                <span className="version-item__meta">
                  {entry.status}
                  {isActive && ` · ${t('versions.active')}`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {activePack && activeEntry && (
        <p className="version-sidebar__muted version-sidebar__stats">
          {activePack.recipes.length} recipes · {activePack.machines.length} machines
        </p>
      )}
    </aside>
  );
}
