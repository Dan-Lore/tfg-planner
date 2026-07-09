import { useCallback, useState } from 'react';
import type { TFunction } from 'i18next';
import { readTfgpFile } from '@/lib/read-tfgp-file';
import { shouldWarnVersionMismatch } from '@/lib/version-mismatch';
import type { EditorActions } from '@/editor/editor-actions';
import type { PackManifestEntry } from '@/data/types';
import type { TfgpFile } from '@/schema/tfgp';

export function useEditorImport(params: {
  activeEntry: PackManifestEntry | null;
  loadScheme: EditorActions['loadScheme'];
  t: TFunction;
}) {
  const { activeEntry, loadScheme, t } = params;
  const [pendingImport, setPendingImport] = useState<TfgpFile | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const importTfgpFile = useCallback(
    async (file: File) => {
      try {
        const parsed = await readTfgpFile(file);
        setImportError(null);
        if (
          shouldWarnVersionMismatch(
            parsed.modpack.version,
            parsed.modpack.dataVersion,
            activeEntry,
          )
        ) {
          setPendingImport(parsed);
          return;
        }
        loadScheme(parsed);
      } catch (err) {
        setImportError(err instanceof Error ? err.message : t('editor.importFailed'));
      }
    },
    [activeEntry, loadScheme, t],
  );

  const confirmPendingImport = useCallback(() => {
    if (!pendingImport) return;
    loadScheme(pendingImport);
    setPendingImport(null);
  }, [pendingImport, loadScheme]);

  const dismissPendingImport = useCallback(() => {
    setPendingImport(null);
  }, []);

  const dismissImportError = useCallback(() => {
    setImportError(null);
  }, []);

  return {
    pendingImport,
    importError,
    importTfgpFile,
    confirmPendingImport,
    dismissPendingImport,
    dismissImportError,
  };
}
