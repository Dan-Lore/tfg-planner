import { useTranslation } from 'react-i18next';
import type { PackManifestEntry } from '@/data/types';
import { usePackStore } from '@/stores/pack-store';
import { useEditorStore } from '@/stores/editor-store';

export function PackVersionPanel() {
  const { t } = useTranslation();
  const manifest = usePackStore((s) => s.manifest);
  const activeEntry = usePackStore((s) => s.activeEntry);
  const activePack = usePackStore((s) => s.activePack);
  const loading = usePackStore((s) => s.loading);
  const error = usePackStore((s) => s.error);
  const selectPack = usePackStore((s) => s.selectPack);
  const switchToPack = useEditorStore((s) => s.switchToPack);

  const handleSelect = (entry: PackManifestEntry) => {
    if (activeEntry?.modpackVersion === entry.modpackVersion) return;
    void selectPack(entry).then(() => {
      switchToPack(entry.modpackVersion, entry.dataVersion);
    });
  };

  return (
    <section className="pack-version-panel card">
      <h2 className="pack-version-panel__title">{t('versions.title')}</h2>
      <p className="pack-version-panel__hint">{t('home.selectVersionHint')}</p>
      {error && <div className="pack-version-panel__error">{error}</div>}
      {loading && manifest.length === 0 && (
        <p className="pack-version-panel__muted">…</p>
      )}
      {manifest.length === 0 && !loading && (
        <p className="pack-version-panel__muted">{t('versions.noPacks')}</p>
      )}
      <ul className="version-list">
        {manifest.map((entry) => {
          const isActive = activeEntry?.modpackVersion === entry.modpackVersion;
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
        <p className="pack-version-panel__muted pack-version-panel__stats">
          {activePack.recipes.length} recipes · {activePack.machines.length} machines
        </p>
      )}
    </section>
  );
}
