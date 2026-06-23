import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import {
  type Connection,
  type Edge,
  type Node,
  type OnEdgesDelete,
  type OnNodesDelete,
  type OnSelectionChangeParams,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useTranslation } from 'react-i18next';
import { usePackStore } from '@/stores/pack-store';
import { useEditorStore } from '@/stores/editor-store';
import { useThemeStore } from '@/stores/theme-store';
import { buildPortDisplays, useNodeTypes } from '@/canvas/MachineNode';
import { EditorCanvas } from '@/canvas/EditorCanvas';
import { FlowEdge } from '@/canvas/FlowEdge';
import { PortContextMenu, type PortAttachDirection } from '@/canvas/PortContextMenu';
import { buildInputPortLoadMeta, buildNodeBalanceLines, buildNodeLoadMeta, rateMapToStrings } from '@/canvas/flow-display';
import { buildMachineNodeLayoutWidths } from '@/canvas/machine-node-layout';
import { downloadTfgp, parseTfgp } from '@/schema/tfgp';
import { getMachineName, getRecipesForMachine } from '@/data/pack-registry';
import { formatRecipeLabel } from '@/lib/recipe-label';
import {
  buildRecipeComboboxItems,
  filterItemsByQuery,
  resolveMachineId,
} from '@/lib/search-combobox';
import { SearchCombobox } from '@/components/SearchCombobox';
import { WheelNumberInput } from '@/components/WheelNumberInput';
import type { VoltageTier } from '@/calculator/gt-voltage';
import {
  allowedTiersForRecipe,
} from '@/calculator/energy';
import {
  buildRecipeFlowIndex,
  findDownstreamCandidates,
  findUpstreamCandidates,
  type AttachCandidate,
} from '@/lib/recipe-index';
import { buildTagIndex } from '@/lib/tag-index';
import type { Flow } from '@/data/types';
import { parsePortId, portFlow, portsMatch } from '@/canvas/ports';

import { PORT_ROW_HEIGHT, estimateHeaderHeight } from '@/canvas/node-bounds';

const NODE_ATTACH_OFFSET_X = 280;

interface PortMenuState {
  x: number;
  y: number;
  anchorNodeId: string;
  anchorPort: string;
  direction: PortAttachDirection;
  candidates: AttachCandidate[];
  flow: Flow;
}

function useEdgeTypes() {
  return useMemo(() => ({ flow: FlowEdge }), []);
}

export function EditorPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'ru';
  const pack = usePackStore((s) => s.activePack);
  const scheme = useEditorStore((s) => s.scheme);
  const flowEdgeData = useEditorStore((s) => s.flowEdgeData);
  const flowResult = useEditorStore((s) => s.flowResult);
  const selectedNodeIds = useEditorStore((s) => s.selectedNodeIds);
  const setNodes = useEditorStore((s) => s.setNodes);
  const setViewport = useEditorStore((s) => s.setViewport);
  const addNode = useEditorStore((s) => s.addNode);
  const updateNode = useEditorStore((s) => s.updateNode);
  const removeNodes = useEditorStore((s) => s.removeNodes);
  const removeEdges = useEditorStore((s) => s.removeEdges);
  const addEdgeToStore = useEditorStore((s) => s.addEdge);
  const attachMachine = useEditorStore((s) => s.attachMachine);
  const pushHistory = useEditorStore((s) => s.pushHistory);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const setTarget = useEditorStore((s) => s.setTarget);
  const duplicateSelected = useEditorStore((s) => s.duplicateSelected);
  const loadScheme = useEditorStore((s) => s.loadScheme);
  const clearScheme = useEditorStore((s) => s.clearScheme);
  const setSelectedNodeIds = useEditorStore((s) => s.setSelectedNodeIds);
  const setSelectedEdgeIds = useEditorStore((s) => s.setSelectedEdgeIds);
  const updateFlows = useEditorStore((s) => s.updateFlows);
  const colorTheme = useThemeStore((s) => s.theme);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const nodeTypes = useNodeTypes();
  const edgeTypes = useEdgeTypes();

  const machines = useMemo(() => {
    if (!pack) return [];
    return pack.machines
      .filter((m) => getRecipesForMachine(pack, m.id).length > 0)
      .sort((a, b) =>
        getMachineName(pack, a.id, lang).localeCompare(
          getMachineName(pack, b.id, lang),
          lang,
        ),
      );
  }, [pack, lang]);

  const [machineExplicitId, setMachineExplicitId] = useState<string | null>(null);
  const [machineQuery, setMachineQuery] = useState('');
  const [machineResetKey, setMachineResetKey] = useState(0);
  const [portMenu, setPortMenu] = useState<PortMenuState | null>(null);

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

  const recipeIndex = useMemo(
    () => (pack ? buildRecipeFlowIndex(pack) : null),
    [pack],
  );

  const tagIndex = useMemo(
    () => (pack ? buildTagIndex(pack) : null),
    [pack],
  );

  useEffect(() => {
    if (pack) updateFlows();
  }, [pack, updateFlows]);

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
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  const connectedPorts = useMemo(() => {
    const inPorts = new Map<string, Set<string>>();
    const outPorts = new Map<string, Set<string>>();
    for (const e of scheme.edges) {
      if (!outPorts.has(e.source)) outPorts.set(e.source, new Set());
      if (!inPorts.has(e.target)) inPorts.set(e.target, new Set());
      outPorts.get(e.source)!.add(e.sourcePort);
      inPorts.get(e.target)!.add(e.targetPort);
    }
    return { inPorts, outPorts };
  }, [scheme.edges]);

  const handleRecipeChange = useCallback(
    (nodeId: string, recipeId: string) => {
      updateNode(nodeId, { recipeId });
    },
    [updateNode],
  );

  const handlePortContextMenu = useCallback(
    (
      nodeId: string,
      portId: string,
      side: 'in' | 'out',
      clientX: number,
      clientY: number,
    ) => {
      if (!pack || !recipeIndex || !tagIndex) return;
      const node = scheme.nodes.find((n) => n.id === nodeId);
      if (!node) return;
      const recipe = pack.recipes.find((r) => r.id === node.recipeId);
      const flow = portFlow(recipe, portId);
      if (!flow) return;

      const direction: PortAttachDirection = side === 'out' ? 'downstream' : 'upstream';
      const candidates =
        direction === 'downstream'
          ? findDownstreamCandidates(pack, recipeIndex, flow, lang, tagIndex)
          : findUpstreamCandidates(pack, recipeIndex, flow, lang, tagIndex);

      setPortMenu({
        x: clientX,
        y: clientY,
        anchorNodeId: nodeId,
        anchorPort: portId,
        direction,
        candidates,
        flow,
      });
    },
    [pack, recipeIndex, tagIndex, scheme.nodes, lang],
  );

  const handlePortMenuSelect = useCallback(
    (candidate: AttachCandidate) => {
      if (!portMenu) return;
      const anchor = scheme.nodes.find((n) => n.id === portMenu.anchorNodeId);
      if (!anchor) return;

      const portIndex = parsePortId(portMenu.anchorPort)?.index ?? 0;
      const portsTop =
        anchor.position.y +
        estimateHeaderHeight(pack!, anchor.machineId, anchor.recipeId);
      const position =
        portMenu.direction === 'downstream'
          ? {
              x: anchor.position.x + NODE_ATTACH_OFFSET_X,
              y: portsTop + portIndex * PORT_ROW_HEIGHT,
            }
          : {
              x: anchor.position.x - NODE_ATTACH_OFFSET_X,
              y: portsTop + portIndex * PORT_ROW_HEIGHT,
            };

      const newId = attachMachine({
        machineId: candidate.machineId,
        recipeId: candidate.recipeId,
        position,
        anchorNodeId: portMenu.anchorNodeId,
        anchorPort: portMenu.anchorPort,
        newPort: candidate.portId,
        direction: portMenu.direction,
        itemId: portMenu.flow.itemId,
        fluidId: portMenu.flow.fluidId,
      });
      setSelectedNodeIds([newId]);
      setPortMenu(null);
    },
    [portMenu, scheme.nodes, attachMachine, setSelectedNodeIds],
  );

  const closePortMenu = useCallback(() => setPortMenu(null), []);

  const layoutWidthByNodeId = useMemo(() => {
    if (!pack) return {};
    return buildMachineNodeLayoutWidths({
      nodes: scheme.nodes,
      pack,
      lang,
      flowResult,
      connectedIn: connectedPorts.inPorts,
      connectedOut: connectedPorts.outPorts,
      t,
    });
  }, [scheme.nodes, pack, lang, flowResult, connectedPorts, t]);

  const rfNodes: Node[] = useMemo(() => {
    if (!pack) return [];
    return scheme.nodes.map((n) => {
      const recipe = pack.recipes.find((r) => r.id === n.recipeId);
      const inputRates = rateMapToStrings(flowResult?.nodeInputRates[n.id]);
      const outputRates = rateMapToStrings(flowResult?.nodeOutputRates[n.id]);
      const outputPortRateRationals = flowResult?.nodePortOutputRates[n.id];
      const connectedIn = connectedPorts.inPorts.get(n.id) ?? new Set();
      const inputPortLoadMeta = flowResult
        ? buildInputPortLoadMeta(n.id, recipe, connectedIn, flowResult, t)
        : undefined;
      const nodeLoadMeta = flowResult
        ? buildNodeLoadMeta(n.id, recipe, flowResult, t)
        : undefined;
      const { inputPorts, outputPorts } = buildPortDisplays(
        recipe,
        pack,
        lang,
        connectedIn,
        connectedPorts.outPorts.get(n.id) ?? new Set(),
        inputRates,
        outputRates,
        outputPortRateRationals,
        inputPortLoadMeta,
      );
      return {
        id: n.id,
        type: 'machine',
        position: n.position,
        selected: selectedNodeIds.includes(n.id),
        data: {
          machineId: n.machineId,
          recipeId: n.recipeId,
          machineCount: n.machineCount,
          overclock: n.overclock,
          parallel: n.parallel,
          voltageTier: n.voltageTier,
          pack,
          onRecipeChange: (recipeId: string) => handleRecipeChange(n.id, recipeId),
          onMachineCountChange: (machineCount: number) =>
            updateNode(n.id, { machineCount }),
          onOverclockChange: (overclock: number) =>
            updateNode(n.id, { overclock }),
          onVoltageTierChange: (voltageTier: VoltageTier) =>
            updateNode(n.id, { voltageTier }),
          onPortContextMenu: (
            portId: string,
            side: 'in' | 'out',
            clientX: number,
            clientY: number,
          ) => handlePortContextMenu(n.id, portId, side, clientX, clientY),
          inputPorts,
          outputPorts,
          balanceLines: flowResult
            ? buildNodeBalanceLines(
                n.id,
                recipe,
                connectedPorts.inPorts.get(n.id) ?? new Set(),
                flowResult,
                pack,
                lang,
              )
            : [],
          loadPercent: nodeLoadMeta?.loadPercent,
          loadLabel: nodeLoadMeta?.label,
          loadTitle: nodeLoadMeta?.title,
          layoutWidth: layoutWidthByNodeId[n.id],
        },
      };
    });
  }, [scheme.nodes, pack, selectedNodeIds, connectedPorts, flowResult, lang, layoutWidthByNodeId, t, handleRecipeChange, handlePortContextMenu, updateNode]);

  const rfEdges: Edge[] = useMemo(
    () =>
      scheme.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourcePort.replace(/^output_/, 'out_').replace(/^input_/, 'in_'),
        targetHandle: e.targetPort.replace(/^output_/, 'out_').replace(/^input_/, 'in_'),
        type: 'flow',
        data: flowEdgeData[e.id],
        animated: true,
      })),
    [scheme.edges, flowEdgeData],
  );

  const onPersistNodePositions = useCallback(
    (current: Node[]) => {
      pushHistory();
      const schemeNodes = useEditorStore.getState().scheme.nodes;
      setNodes(
        schemeNodes.map((n) => {
          const rf = current.find((u) => u.id === n.id);
          return rf ? { ...n, position: rf.position } : n;
        }),
      );
    },
    [setNodes, pushHistory],
  );

  const isValidConnection = useCallback(
    (conn: Connection | Edge) => {
      if (!pack || !conn.source || !conn.target) return false;
      if (!conn.sourceHandle?.startsWith('out_')) return false;
      if (!conn.targetHandle?.startsWith('in_')) return false;
      const srcNode = scheme.nodes.find((n) => n.id === conn.source);
      const tgtNode = scheme.nodes.find((n) => n.id === conn.target);
      const srcRecipe = pack.recipes.find((r) => r.id === srcNode?.recipeId);
      const tgtRecipe = pack.recipes.find((r) => r.id === tgtNode?.recipeId);
      const srcFlow = portFlow(srcRecipe, conn.sourceHandle);
      const tgtFlow = portFlow(tgtRecipe, conn.targetHandle);
      return portsMatch(srcFlow, tgtFlow, tagIndex ?? undefined);
    },
    [pack, scheme.nodes, tagIndex],
  );

  const onConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target || !conn.sourceHandle || !conn.targetHandle) {
        return;
      }
      if (!isValidConnection(conn)) return;
      const srcNode = scheme.nodes.find((n) => n.id === conn.source);
      const srcRecipe = pack?.recipes.find((r) => r.id === srcNode?.recipeId);
      const srcFlow = portFlow(srcRecipe, conn.sourceHandle);
      if (!srcFlow) return;
      addEdgeToStore({
        source: conn.source,
        target: conn.target,
        sourcePort: conn.sourceHandle,
        targetPort: conn.targetHandle,
        itemId: srcFlow.itemId,
        fluidId: srcFlow.fluidId,
      });
    },
    [pack, scheme.nodes, addEdgeToStore, isValidConnection],
  );

  const onSelectionChange = useCallback(
    ({ nodes, edges }: OnSelectionChangeParams) => {
      setSelectedNodeIds(nodes.map((n) => n.id));
      setSelectedEdgeIds(edges.map((e) => e.id));
    },
    [setSelectedNodeIds, setSelectedEdgeIds],
  );

  const onNodesDelete = useCallback<OnNodesDelete>(
    (nodes) => {
      removeNodes(nodes.map((n) => n.id));
    },
    [removeNodes],
  );

  const onEdgesDelete = useCallback<OnEdgesDelete>(
    (edges) => {
      removeEdges(edges.map((e) => e.id));
    },
    [removeEdges],
  );

  const selectedNode = scheme.nodes.find((n) => n.id === selectedNodeIds[0]);
  const selectedRecipe = selectedNode
    ? pack?.recipes.find((r) => r.id === selectedNode.recipeId)
    : undefined;
  const selectedAllowedTiers = selectedRecipe
    ? allowedTiersForRecipe(selectedRecipe)
    : [];

  const handleAddMachine = () => {
    if (!pack || !resolvedMachineId) return;
    const recipes = getRecipesForMachine(pack, resolvedMachineId);
    if (recipes.length === 0) return;
    const firstRecipe = recipes[0]!;
    const newId = addNode({
      machineId: resolvedMachineId,
      recipeId: firstRecipe.id,
      position: { x: 100 + scheme.nodes.length * 30, y: 100 + scheme.nodes.length * 20 },
      overclock: 1,
      parallel: 1,
      machineCount: 1,
      voltageTier: firstRecipe.energy?.minVoltageTier ?? 'LV',
    });
    setSelectedNodeIds([newId]);
    setMachineExplicitId(null);
    setMachineQuery('');
    setMachineResetKey((k) => k + 1);
  };

  const selectedRecipeItems = useMemo(() => {
    if (!pack || !selectedNode) return [];
    return buildRecipeComboboxItems(
      pack,
      getRecipesForMachine(pack, selectedNode.machineId),
      lang,
    );
  }, [pack, selectedNode, lang]);

  const selectedRecipeDisplay = useMemo(() => {
    if (!pack || !selectedNode) return '';
    const recipe = pack.recipes.find((r) => r.id === selectedNode.recipeId);
    return recipe ? formatRecipeLabel(pack, recipe, lang) : '';
  }, [pack, selectedNode, lang]);

  const handleClearScheme = () => {
    if (!window.confirm(t('editor.clearSchemeConfirm'))) return;
    clearScheme();
  };

  const handleImport = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseTfgp(reader.result as string);
        loadScheme(parsed);
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Import failed');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  if (!pack) {
    return (
      <div className="editor-page editor-page--empty">
        <div className="alert editor-empty-alert">{t('editor.noPack')}</div>
      </div>
    );
  }

  return (
    <div className="editor-page">
      <div className="editor-toolbar">
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
            if (!selectedNode) return;
            const recipe = pack.recipes.find((r) => r.id === selectedNode.recipeId);
            const out = recipe?.outputs[0];
            const v = prompt(t('editor.ratePrompt'), '1');
            if (!v || !out) return;
            setTarget({
              nodeId: selectedNode.id,
              itemId: out.itemId,
              fluidId: out.fluidId,
              ratePerSecond: Number(v),
            });
          }}
          disabled={!selectedNode}
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
          type="file"
          accept=".tfgp,application/json"
          hidden
          onChange={handleImport}
        />
      </div>
      <div className="editor-body">
        <div className="editor-canvas-wrap">
          <EditorCanvas
            rfNodes={rfNodes}
            rfEdges={rfEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            colorTheme={colorTheme}
            defaultViewport={scheme.viewport}
            onPersistNodePositions={onPersistNodePositions}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            onSelectionChange={onSelectionChange}
            onNodesDelete={onNodesDelete}
            onEdgesDelete={onEdgesDelete}
            onPaneClick={closePortMenu}
            onNodeClick={closePortMenu}
            onMoveEnd={(vp) => setViewport(vp)}
          />
        </div>
        <aside className="editor-sidebar">
          <h3>{t('editor.title')}</h3>
          {!selectedNode ? (
            <p className="editor-sidebar__hint">{t('editor.selectNode')}</p>
          ) : (
            <>
              <p>
                <strong>
                  {getMachineName(pack, selectedNode.machineId, lang)}
                </strong>
              </p>
              <label>{t('editor.recipe')}</label>
              <SearchCombobox
                mode="recipe"
                items={selectedRecipeItems}
                value={selectedNode.recipeId}
                displayValue={selectedRecipeDisplay}
                placeholder={t('editor.searchRecipe')}
                resetKey={selectedNode.recipeId}
                onChange={(recipeId) =>
                  updateNode(selectedNode.id, { recipeId })
                }
              />
              <label>{t('editor.machineCount')}</label>
              <WheelNumberInput
                min={1}
                step={1}
                value={selectedNode.machineCount}
                onChange={(machineCount) =>
                  updateNode(selectedNode.id, {
                    machineCount: Math.max(1, machineCount),
                  })
                }
              />
              <label>{t('editor.overclock')}</label>
              <WheelNumberInput
                min={0.1}
                step={0.1}
                value={selectedNode.overclock}
                onChange={(overclock) =>
                  updateNode(selectedNode.id, { overclock })
                }
              />
              {selectedAllowedTiers.length > 0 && (
                <>
                  <label>{t('editor.voltageTier')}</label>
                  <select
                    className="editor-sidebar__select"
                    value={selectedNode.voltageTier}
                    onChange={(e) =>
                      updateNode(selectedNode.id, {
                        voltageTier: e.target.value as VoltageTier,
                      })
                    }
                  >
                    {selectedAllowedTiers.map((tier) => (
                      <option key={tier} value={tier}>
                        {tier}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </>
          )}
        </aside>
      </div>
      {portMenu && (
        <PortContextMenu
          x={portMenu.x}
          y={portMenu.y}
          pack={pack}
          lang={lang}
          direction={portMenu.direction}
          candidates={portMenu.candidates}
          onSelect={handlePortMenuSelect}
          onClose={closePortMenu}
        />
      )}
    </div>
  );
}
