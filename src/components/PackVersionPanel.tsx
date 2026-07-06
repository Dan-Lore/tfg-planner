import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PackManifestEntry } from '@/data/types';
import { recipeCount } from '@/data/pack-registry';
import { packEntryNeedsLoad } from '@/lib/resolve-pack-entry';
import { isSchemeNonEmpty } from '@/lib/version-mismatch';
import { usePackStore } from '@/stores/pack-store';
import { useEditorStore } from '@/stores/editor-store';
import { ConfirmDialog } from '@/components/ConfirmDialog';

export function PackVersionPanel() {
  const { t } = useTranslation();
  const manifest = usePackStore((s) => s.manifest);
  const activeEntry = usePackStore((s) => s.activeEntry);
  const activePack = usePackStore((s) => s.activePack);
  const loading = usePackStore((s) => s.loading);
  const loadStage = usePackStore((s) => s.loadStage);
  const error = usePackStore((s) => s.error);
  const selectPack = usePackStore((s) => s.selectPack);
  const scheme = useEditorStore((s) => s.scheme);
  const switchToPack = useEditorStore((s) => s.switchToPack);
  const [pendingEntry, setPendingEntry] = useState<PackManifestEntry | null>(null);

  const applyPackSwitch = (entry: PackManifestEntry) => {
    void selectPack(entry).then(() => {
      switchToPack(entry.modpackVersion, entry.dataVersion);
    });
  };

  const handleSelect = (entry: PackManifestEntry) => {
    if (!packEntryNeedsLoad(entry, activePack, activeEntry)) return;
    if (
      isSchemeNonEmpty(scheme) &&
      (scheme.modpack.version !== entry.modpackVersion ||
        scheme.modpack.dataVersion !== entry.dataVersion)
    ) {
      setPendingEntry(entry);
      return;
    }
    applyPackSwitch(entry);
  };

  return (
    <section className="pack-version-panel card">
      <h2 className="pack-version-panel__title">{t('versions.title')}</h2>
      <p className="pack-version-panel__hint">{t('home.selectVersionHint')}</p>
      {error && <div className="pack-version-panel__error">{error}</div>}
      {loading && manifest.length === 0 && (
        <p className="pack-version-panel__muted">{t('versions.loadingMeta')}</p>
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
                  {isActive && activePack && ` · ${t('versions.active')}`}
                  {isActive && !activePack && ` · ${t('versions.restoringPack')}`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {activeEntry && !activePack && (
        <p className="pack-version-panel__muted">{t('versions.restoringPack')}</p>
      )}
      {activePack && activeEntry && (
        <p className="pack-version-panel__muted pack-version-panel__stats">
          {recipeCount(activePack)} recipes · {activePack.machines.length} machines
          {loadStage === 'ready' && ` · ${t('versions.recipesLazy')}`}
        </p>
      )}
      {pendingEntry && (
        <ConfirmDialog
          open
          title={t('editor.versionMismatch.title')}
          message={t('editor.versionMismatch.switchMessage', {
            schemeVersion: scheme.modpack.version,
            newVersion: pendingEntry.modpackVersion,
          })}
          confirmLabel={t('editor.versionMismatch.confirm')}
          cancelLabel={t('dialog.cancel')}
          onConfirm={() => {
            applyPackSwitch(pendingEntry);
            setPendingEntry(null);
          }}
          onCancel={() => setPendingEntry(null)}
        />
      )}
    </section>
  );
}
