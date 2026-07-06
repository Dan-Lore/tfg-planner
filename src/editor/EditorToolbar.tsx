import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { SearchCombobox } from '@/components/SearchCombobox';
import { getMachineName, getMachineRecipeCount } from '@/data/pack-registry';
import type { ActivePack } from '@/data/pack-runtime';
import type { PackManifestEntry } from '@/data/types';
import { filterItemsByQuery, resolveMachineId } from '@/lib/search-combobox';
import { downloadTfgp, type TfgpFile } from '@/schema/tfgp';
import type { FlowComputeState } from '@/stores/editor-store';
import type { FocusSelectionParams } from '@/hooks/useEditorSelection';
import type { EditorActions } from '@/editor/editor-actions';
import { EditorHelpHint } from '@/editor/EditorHelpHint';
import { ConfirmDialog } from '@/components/ConfirmDialog';

export interface EditorToolbarProps {
  activeEntry: PackManifestEntry | null;
  pack: ActivePack | null;
  scheme: TfgpFile;
  selectedNodeIds: string[];
  flowComputeState: FlowComputeState;
  addNode: EditorActions['addNode'];
  addCustomMachine: EditorActions['addCustomMachine'];
  duplicateSelected: EditorActions['duplicateSelected'];
  copySelection: EditorActions['copySelection'];
  pasteClipboard: EditorActions['pasteClipboard'];
  undo: EditorActions['undo'];
  redo: EditorActions['redo'];
  clearScheme: EditorActions['clearScheme'];
  focusSelection: (params: FocusSelectionParams) => void;
  onImportFile: (file: File) => void;
}

export function EditorToolbar({
  activeEntry,
  pack,
  scheme,
  selectedNodeIds,
  flowComputeState,
  addNode,
  addCustomMachine,
  duplicateSelected,
  copySelection,
  pasteClipboard,
  undo,
  redo,
  clearScheme,
  focusSelection,
  onImportFile,
}: EditorToolbarProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'ru';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

  const [machineExplicitId, setMachineExplicitId] = useState<string | null>(null);
  const [machineQuery, setMachineQuery] = useState('');
  const [machineResetKey, setMachineResetKey] = useState(0);

  const machines = useMemo(() => {
    if (!pack) return [];
    return pack.machines
      .filter((m) => getMachineRecipeCount(pack, m.id) > 0)
      .sort((a, b) =>
        getMachineName(pack, a.id, lang).localeCompare(
          getMachineName(pack, b.id, lang),
          lang,
        ),
      );
  }, [pack, lang]);

  const machineItems = useMemo(() => {
    if (!pack) return [];
    return machines.map((m) => ({
      id: m.id,
      label: getMachineName(pack, m.id, lang),
      searchText: getMachineName(pack, m.id, lang),
    }));
  }, [machines, pack, lang]);

  const filteredMachineItems = useMemo(
    () => filterItemsByQuery(machineItems, machineQuery),
    [machineItems, machineQuery],
  );

  const resolvedMachineId = useMemo(
    () => resolveMachineId(machineExplicitId, filteredMachineItems),
    [machineExplicitId, filteredMachineItems],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z' && !e.shiftKey) {
          e.preventDefault();
          undo();
        } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
          e.preventDefault();
          redo();
        } else if (e.key === 'c') {
          e.preventDefault();
          copySelection();
        } else if (e.key === 'v') {
          e.preventDefault();
          pasteClipboard();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, copySelection, pasteClipboard]);

  const handleAddMachine = () => {
    if (!pack || !resolvedMachineId) return;
    void (async () => {
      const recipes = await pack.loadMachineRecipes(resolvedMachineId);
      if (recipes.length === 0) return;
      const firstRecipe = recipes[0]!;
      const newId = addNode({
        kind: 'machine',
        machineId: resolvedMachineId,
        recipeId: firstRecipe.id,
        position: { x: 100 + scheme.nodes.length * 30, y: 100 + scheme.nodes.length * 20 },
        overclock: 1,
        machineCount: 1,
        voltageTier: firstRecipe.energy?.minVoltageTier ?? 'LV',
      });
      focusSelection({ nodeIds: [newId], edgeIds: [] });
      setMachineExplicitId(null);
      setMachineQuery('');
      setMachineResetKey((k) => k + 1);
    })();
  };

  const handleAddCustomMachine = () => {
    const newId = addCustomMachine({
      x: 120 + scheme.nodes.length * 30,
      y: 120 + scheme.nodes.length * 20,
    });
    focusSelection({ nodeIds: [newId], edgeIds: [] });
  };

  const handleClearScheme = () => {
    setClearConfirmOpen(true);
  };

  const handleImport = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onImportFile(file);
    e.target.value = '';
  };

  return (
    <div className="editor-toolbar">
      <div className="editor-toolbar__group">
        {activeEntry && (
          <span className="editor-toolbar__pack" title={t('editor.activePack')}>
            {activeEntry.modpackVersion}
          </span>
        )}
        <div className="editor-toolbar__add">
          <SearchCombobox
            mode="machine"
            className="editor-toolbar__machine-search"
            items={machineItems}
            value={resolvedMachineId ?? ''}
            explicitId={machineExplicitId}
            placeholder={t('editor.searchMachine')}
            onExplicitPick={setMachineExplicitId}
            onQueryChange={setMachineQuery}
            resetKey={machineResetKey}
            onChange={() => {}}
          />
          <button
            type="button"
            className="btn"
            onClick={handleAddMachine}
            disabled={!resolvedMachineId}
          >
            {t('editor.addMachine')}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleAddCustomMachine}
            disabled={!pack}
          >
            {t('editor.addCustomMachine')}
          </button>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={duplicateSelected}
          disabled={selectedNodeIds.length === 0}
        >
          {t('editor.duplicate')}
        </button>
        <button type="button" className="btn btn-secondary" onClick={undo}>
          {t('editor.undo')} (Ctrl+Z)
        </button>
        <button type="button" className="btn btn-secondary" onClick={redo}>
          {t('editor.redo')} (Ctrl+Y)
        </button>
        {flowComputeState !== 'idle' && (
          <span className="editor-toolbar__compute" aria-live="polite">
            {flowComputeState === 'computing'
              ? t('editor.flowComputing')
              : t('editor.flowStale')}
          </span>
        )}
        <button
          type="button"
          className="btn btn-secondary editor-toolbar__clear"
          onClick={handleClearScheme}
          disabled={scheme.nodes.length === 0 && scheme.edges.length === 0}
        >
          {t('editor.clearScheme')}
        </button>
      </div>
      <div className="editor-toolbar__group editor-toolbar__group--end">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => downloadTfgp(scheme)}
        >
          {t('editor.export')}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => fileInputRef.current?.click()}
        >
          {t('editor.import')}
        </button>
        <input
          ref={fileInputRef}
          id="editor-import-tfgp"
          name="tfgp-import"
          type="file"
          accept=".tfgp,application/json"
          hidden
          onChange={handleImport}
        />
        <EditorHelpHint />
      </div>
      <ConfirmDialog
        open={clearConfirmOpen}
        title={t('editor.clearScheme')}
        message={t('editor.clearSchemeConfirm')}
        confirmLabel={t('dialog.confirm')}
        cancelLabel={t('dialog.cancel')}
        onConfirm={() => {
          clearScheme();
          setClearConfirmOpen(false);
        }}
        onCancel={() => setClearConfirmOpen(false)}
      />
    </div>
  );
}
