import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { SearchCombobox } from '@/components/SearchCombobox';
import { getMachineName, getRecipe, getMachineRecipeCount } from '@/data/pack-registry';
import type { ActivePack } from '@/data/pack-runtime';
import type { PackManifestEntry } from '@/data/types';
import { filterItemsByQuery, resolveMachineId } from '@/lib/search-combobox';
import { parsePositiveRate } from '@/lib/parse-positive-rate';
import { isMachineNode } from '@/lib/node-kind';
import { downloadTfgp, type TfgpFile } from '@/schema/tfgp';
import type { FlowComputeState } from '@/stores/editor-store';
import type { EditorActions } from '@/editor/editor-actions';

export interface EditorToolbarProps {
  activeEntry: PackManifestEntry | null;
  pack: ActivePack | null;
  scheme: TfgpFile;
  selectedNodeIds: string[];
  flowComputeState: FlowComputeState;
  addNode: EditorActions['addNode'];
  setTarget: EditorActions['setTarget'];
  duplicateSelected: EditorActions['duplicateSelected'];
  undo: EditorActions['undo'];
  redo: EditorActions['redo'];
  clearScheme: EditorActions['clearScheme'];
  setSelectedNodeIds: EditorActions['setSelectedNodeIds'];
  onImportFile: (file: File) => void;
}

export function EditorToolbar({
  activeEntry,
  pack,
  scheme,
  selectedNodeIds,
  flowComputeState,
  addNode,
  setTarget,
  duplicateSelected,
  undo,
  redo,
  clearScheme,
  setSelectedNodeIds,
  onImportFile,
}: EditorToolbarProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'ru';
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const selectedNode = scheme.nodes.find((n) => n.id === selectedNodeIds[0]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z' && !e.shiftKey) {
          e.preventDefault();
          undo();
        } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
          e.preventDefault();
          redo();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

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
      setSelectedNodeIds([newId]);
      setMachineExplicitId(null);
      setMachineQuery('');
      setMachineResetKey((k) => k + 1);
    })();
  };

  const handleClearScheme = () => {
    if (!window.confirm(t('editor.clearSchemeConfirm'))) return;
    clearScheme();
  };

  const handleImport = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onImportFile(file);
    e.target.value = '';
  };

  return (
    <div className="editor-toolbar">
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
      </div>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => {
          if (!pack || !selectedNode || !isMachineNode(selectedNode)) return;
          const recipe = getRecipe(pack, selectedNode.recipeId);
          const out = recipe?.outputs[0];
          const v = prompt(t('editor.ratePrompt'), '1');
          if (!v || !out) return;
          const rate = parsePositiveRate(v);
          if (rate === null) {
            alert(t('editor.rateInvalid'));
            return;
          }
          setTarget({
            nodeId: selectedNode.id,
            itemId: out.itemId,
            fluidId: out.fluidId,
            ratePerSecond: rate,
          });
        }}
        disabled={!pack || !selectedNode || !isMachineNode(selectedNode)}
      >
        {t('editor.targetRate')}
      </button>
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
      <span className="editor-toolbar__hint">{t('editor.deleteHint')}</span>
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
      <button
        type="button"
        className="btn btn-secondary editor-toolbar__clear"
        onClick={handleClearScheme}
        disabled={scheme.nodes.length === 0 && scheme.edges.length === 0}
      >
        {t('editor.clearScheme')}
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
    </div>
  );
}
