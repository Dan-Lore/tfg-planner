import { Link } from 'react-router-dom';
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
import {
  buildBufferPortDisplays,
  formatBufferRate,
} from '@/canvas/BufferNode';
import { EditorCanvas } from '@/canvas/EditorCanvas';
import { FlowEdge } from '@/canvas/FlowEdge';
import {
  PortContextMenu,
  bufferKindsForPort,
  type PortAttachDirection,
} from '@/canvas/PortContextMenu';
import { buildInputPortLoadMeta, buildNodeBalanceLines, buildNodeLoadMeta, buildOutputPortLoadMeta, rateMapToStrings } from '@/canvas/flow-display';
import { buildMachineNodeLayoutWidths } from '@/canvas/machine-node-layout';
import { downloadTfgp, parseTfgp } from '@/schema/tfgp';
import { getMachineName, getRecipesForMachine } from '@/data/pack-registry';
import { EditorInspector } from '@/editor/EditorInspector';
import {
  SchemeIssuesPanel,
  pickEdgeIssueMeta,
  pickNodeIssueMeta,
} from '@/editor/SchemeIssuesPanel';
import type { SchemeIssue } from '@/scheme-check/check-scheme';
import {
  filterItemsByQuery,
  resolveMachineId,
} from '@/lib/search-combobox';
import { SearchCombobox } from '@/components/SearchCombobox';
import type { VoltageTier } from '@/calculator/gt-voltage';
import { R } from '@/calculator/rational';
import {
  buildRecipeFlowIndex,
  findDownstreamCandidates,
  findUpstreamCandidates,
  type AttachCandidate,
} from '@/lib/recipe-index';
import { buildTagIndex } from '@/lib/tag-index';
import type { Flow, PackData } from '@/data/types';
import { parsePortId, nodePortFlow, portsMatch } from '@/canvas/ports';
import { isBufferNode, isMachineNode } from '@/lib/node-kind';
import type { TfgpBufferKind, TfgpNode } from '@/schema/tfgp';

import {
  PORT_ROW_HEIGHT,
  estimateHeaderHeight,
} from '@/canvas/node-bounds';

const NODE_ATTACH_OFFSET_X = 280;

interface PortMenuState {
  x: number;
  y: number;
  anchorNodeId: string;
  anchorPort: string;
  portSide: 'in' | 'out';
  direction: PortAttachDirection;
  bufferOptions: TfgpBufferKind[];
  candidates: AttachCandidate[];
  flow: Flow;
}

function anchorPortY(
  anchor: TfgpNode,
  anchorPort: string,
  pack: PackData,
): number {
  const portIndex = parsePortId(anchorPort)?.index ?? 0;
  if (isBufferNode(anchor)) {
    const header = 56;
    const fields = anchor.kind === 'start_buffer' ? 88 : 36;
    return anchor.position.y + header + fields + portIndex * PORT_ROW_HEIGHT;
  }
  return (
    anchor.position.y +
    estimateHeaderHeight(pack, anchor.machineId, anchor.recipeId) +
    portIndex * PORT_ROW_HEIGHT
  );
}

function useEdgeTypes() {
  return useMemo(() => ({ flow: FlowEdge }), []);
}

export function EditorPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'ru';
  const pack = usePackStore((s) => s.activePack);
  const activeEntry = usePackStore((s) => s.activeEntry);
  const scheme = useEditorStore((s) => s.scheme);
  const flowEdgeData = useEditorStore((s) => s.flowEdgeData);
  const flowResult = useEditorStore((s) => s.flowResult);
  const schemeCheckResult = useEditorStore((s) => s.schemeCheckResult);
  const selectedNodeIds = useEditorStore((s) => s.selectedNodeIds);
  const selectedEdgeIds = useEditorStore((s) => s.selectedEdgeIds);
  const setNodes = useEditorStore((s) => s.setNodes);
  const setViewport = useEditorStore((s) => s.setViewport);
  const addNode = useEditorStore((s) => s.addNode);
  const updateNode = useEditorStore((s) => s.updateNode);
  const removeNodes = useEditorStore((s) => s.removeNodes);
  const removeEdges = useEditorStore((s) => s.removeEdges);
  const addEdgeToStore = useEditorStore((s) => s.addEdge);
  const attachMachine = useEditorStore((s) => s.attachMachine);
  const attachBuffer = useEditorStore((s) => s.attachBuffer);
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
      const recipe = isMachineNode(node)
        ? pack.recipes.find((r) => r.id === node.recipeId)
        : undefined;
      const flow = nodePortFlow(node, portId, recipe);
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
        portSide: side,
        direction,
        bufferOptions: bufferKindsForPort(side),
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

      const portY = anchorPortY(anchor, portMenu.anchorPort, pack!);
      const position =
        portMenu.direction === 'downstream'
          ? {
              x: anchor.position.x + NODE_ATTACH_OFFSET_X,
              y: portY,
            }
          : {
              x: anchor.position.x - NODE_ATTACH_OFFSET_X,
              y: portY,
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

  const handlePortBufferSelect = useCallback(
    (bufferKind: TfgpBufferKind) => {
      if (!portMenu || !pack) return;
      const anchor = scheme.nodes.find((n) => n.id === portMenu.anchorNodeId);
      if (!anchor) return;

      const portY = anchorPortY(anchor, portMenu.anchorPort, pack);
      const position =
        portMenu.direction === 'downstream'
          ? { x: anchor.position.x + NODE_ATTACH_OFFSET_X, y: portY }
          : { x: anchor.position.x - NODE_ATTACH_OFFSET_X, y: portY };

      const newId = attachBuffer({
        bufferKind,
        position,
        anchorNodeId: portMenu.anchorNodeId,
        anchorPort: portMenu.anchorPort,
        direction: portMenu.direction,
        itemId: portMenu.flow.itemId,
        fluidId: portMenu.flow.fluidId,
      });
      setSelectedNodeIds([newId]);
      setPortMenu(null);
    },
    [portMenu, scheme.nodes, pack, attachBuffer, setSelectedNodeIds],
  );

  const closePortMenu = useCallback(() => setPortMenu(null), []);

  const handleFocusIssue = useCallback(
    (issue: SchemeIssue) => {
      if (issue.edgeId) {
        const edge = scheme.edges.find((e) => e.id === issue.edgeId);
        setSelectedEdgeIds([issue.edgeId]);
        setSelectedNodeIds(edge ? [edge.source, edge.target] : issue.nodeId ? [issue.nodeId] : []);
        return;
      }
      if (issue.nodeId) {
        setSelectedNodeIds([issue.nodeId]);
        setSelectedEdgeIds([]);
      }
    },
    [scheme.edges, setSelectedEdgeIds, setSelectedNodeIds],
  );

  const layoutWidthByNodeId = useMemo(() => {
    if (!pack) return {};
    return buildMachineNodeLayoutWidths({
      nodes: scheme.nodes,
      pack,
      lang,
      flowResult: flowResult ?? undefined,
      connectedIn: connectedPorts.inPorts,
      connectedOut: connectedPorts.outPorts,
      t,
    });
  }, [scheme.nodes, pack, lang, flowResult, connectedPorts, t]);

  const rfNodes: Node[] = useMemo(() => {
    if (!pack) return [];
    return scheme.nodes.map((n) => {
      const connectedIn = connectedPorts.inPorts.get(n.id) ?? new Set();
      const connectedOut = connectedPorts.outPorts.get(n.id) ?? new Set();

      if (isBufferNode(n)) {
        const inRate = formatBufferRate(flowResult?.nodeInputRates[n.id]
          ? Object.values(flowResult.nodeInputRates[n.id]!)[0]
          : undefined);
        const outRate = formatBufferRate(flowResult?.nodePortOutputRates[n.id]?.out_0);
        const inLoad = flowResult?.nodePortInLoad[n.id]?.in_0
          ?.mul(R.from(100))
          .toNumber();
        const outLoad = flowResult?.nodePortOutLoad[n.id]?.out_0
          ?.mul(R.from(100))
          .toNumber();
        const loadFraction = flowResult?.nodeLoad[n.id];
        const loadPercent = loadFraction
          ? Math.min(100, Math.max(0, loadFraction.mul(R.from(100)).toNumber()))
          : undefined;
        const { inputPorts, outputPorts } = buildBufferPortDisplays(
          n.kind,
          pack,
          lang,
          n.itemId,
          n.fluidId,
          connectedIn,
          connectedOut,
          inRate,
          outRate,
          inLoad,
          outLoad,
        );
        const nodeIssue = pickNodeIssueMeta(n.id, schemeCheckResult);
        return {
          id: n.id,
          type: 'buffer',
          position: n.position,
          selected: selectedNodeIds.includes(n.id),
          data: {
            bufferKind: n.kind,
            itemId: n.itemId,
            fluidId: n.fluidId,
            capacity: n.capacity,
            supplyMode: n.kind === 'start_buffer' ? n.supplyMode : undefined,
            supplyRate: n.kind === 'start_buffer' ? n.supplyRate : undefined,
            initialStock: n.kind === 'start_buffer' ? n.initialStock : undefined,
            autoSupplyRate: n.kind === 'start_buffer' ? n.autoSupplyRate : undefined,
            pack,
            checkSeverity: nodeIssue?.severity,
            checkTitle: nodeIssue?.title,
            inputPorts,
            outputPorts,
            loadPercent,
            loadLabel:
              loadPercent != null
                ? t('editor.nodeLoadMeta', {
                    value: `${Math.round(loadPercent)}%`,
                  })
                : undefined,
            onCapacityChange: (capacity: number) => updateNode(n.id, { capacity }),
            onSupplyModeChange: (supplyMode: 'rate' | 'stock') =>
              updateNode(n.id, { supplyMode }),
            onSupplyRateChange: (supplyRate: number) =>
              updateNode(n.id, { supplyRate }),
            onInitialStockChange: (initialStock: number) =>
              updateNode(n.id, { initialStock }),
            onPortContextMenu: (
              portId: string,
              side: 'in' | 'out',
              clientX: number,
              clientY: number,
            ) => handlePortContextMenu(n.id, portId, side, clientX, clientY),
          },
        };
      }

      const recipe = pack.recipes.find((r) => r.id === n.recipeId);
      const inputRates = rateMapToStrings(flowResult?.nodeInputRates[n.id]);
      const outputRates = rateMapToStrings(flowResult?.nodeOutputRates[n.id]);
      const outputPortRateRationals = flowResult?.nodePortOutputRates[n.id];
      const inputPortLoadMeta = flowResult
        ? buildInputPortLoadMeta(n.id, recipe, connectedIn, flowResult, t)
        : undefined;
      const outputPortLoadMeta = flowResult
        ? buildOutputPortLoadMeta(n.id, recipe, connectedOut, flowResult, t)
        : undefined;
      const nodeLoadMeta = flowResult
        ? buildNodeLoadMeta(n.id, recipe, flowResult, t)
        : undefined;
      const { inputPorts, outputPorts } = buildPortDisplays(
        recipe,
        pack,
        lang,
        connectedIn,
        connectedOut,
        inputRates,
        outputRates,
        outputPortRateRationals,
        inputPortLoadMeta,
        outputPortLoadMeta,
      );
      const nodeIssue = pickNodeIssueMeta(n.id, schemeCheckResult);
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
          checkSeverity: nodeIssue?.severity,
          checkTitle: nodeIssue?.title,
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
          loadPercent: nodeLoadMeta?.currentLoadPercent,
          loadLabel: nodeLoadMeta?.label,
          loadTitle: nodeLoadMeta?.title,
          layoutWidth: layoutWidthByNodeId[n.id],
        },
        ...(layoutWidthByNodeId[n.id] != null
          ? { width: layoutWidthByNodeId[n.id] }
          : {}),
      };
    });
  }, [scheme.nodes, pack, selectedNodeIds, connectedPorts, flowResult, schemeCheckResult, lang, layoutWidthByNodeId, t, handleRecipeChange, handlePortContextMenu, updateNode]);

  const rfEdges: Edge[] = useMemo(
    () =>
      scheme.edges.map((e) => {
        const edgeIssue = pickEdgeIssueMeta(e.id, schemeCheckResult);
        const baseData = flowEdgeData[e.id] ?? {};
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourcePort.replace(/^output_/, 'out_').replace(/^input_/, 'in_'),
          targetHandle: e.targetPort.replace(/^output_/, 'out_').replace(/^input_/, 'in_'),
          type: 'flow',
          selected: selectedEdgeIds.includes(e.id),
          data: {
            ...baseData,
            checkSeverity: edgeIssue?.severity,
            checkTitle: edgeIssue?.title,
          },
          animated: !edgeIssue,
        };
      }),
    [scheme.edges, flowEdgeData, schemeCheckResult, selectedEdgeIds],
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
      if (!srcNode || !tgtNode) return false;
      const srcRecipe = isMachineNode(srcNode)
        ? pack.recipes.find((r) => r.id === srcNode.recipeId)
        : undefined;
      const tgtRecipe = isMachineNode(tgtNode)
        ? pack.recipes.find((r) => r.id === tgtNode.recipeId)
        : undefined;
      const srcFlow = nodePortFlow(srcNode, conn.sourceHandle, srcRecipe);
      const tgtFlow = nodePortFlow(tgtNode, conn.targetHandle, tgtRecipe);
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
      if (!srcNode) return;
      const srcRecipe = isMachineNode(srcNode)
        ? pack?.recipes.find((r) => r.id === srcNode.recipeId)
        : undefined;
      const srcFlow = nodePortFlow(srcNode, conn.sourceHandle, srcRecipe);
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

  const handleAddMachine = () => {
    if (!pack || !resolvedMachineId) return;
    const recipes = getRecipesForMachine(pack, resolvedMachineId);
    if (recipes.length === 0) return;
    const firstRecipe = recipes[0]!;
    const newId = addNode({
      kind: 'machine',
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
        <div className="alert editor-empty-alert">
          <p>{t('editor.noPack')}</p>
          <Link to="/" className="btn">
            {t('editor.selectPackOnHome')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="editor-page">
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
            if (!selectedNode || !isMachineNode(selectedNode)) return;
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
          disabled={!selectedNode || !isMachineNode(selectedNode)}
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
        <aside className="editor-sidebar editor-element-panel">
          <h3>{t('editor.elementEditor')}</h3>
          <SchemeIssuesPanel
            pack={pack}
            lang={lang}
            nodes={scheme.nodes}
            edges={scheme.edges}
            schemeCheck={schemeCheckResult}
            onFocusIssue={handleFocusIssue}
          />
          <EditorInspector
            pack={pack}
            lang={lang}
            nodes={scheme.nodes}
            edges={scheme.edges}
            flowResult={flowResult}
            flowEdgeData={flowEdgeData}
            selectedNodeIds={selectedNodeIds}
            selectedEdgeIds={selectedEdgeIds}
            connectedInByNode={connectedPorts.inPorts}
            connectedOutByNode={connectedPorts.outPorts}
            updateNode={updateNode}
          />
        </aside>
      </div>
      {portMenu && (
        <PortContextMenu
          x={portMenu.x}
          y={portMenu.y}
          pack={pack}
          lang={lang}
          direction={portMenu.direction}
          portSide={portMenu.portSide}
          bufferOptions={portMenu.bufferOptions}
          candidates={portMenu.candidates}
          onSelectBuffer={handlePortBufferSelect}
          onSelect={handlePortMenuSelect}
          onClose={closePortMenu}
        />
      )}
    </div>
  );
}
