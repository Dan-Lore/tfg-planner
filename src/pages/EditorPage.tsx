import { Link } from 'react-router-dom';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
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
import { useShallow } from 'zustand/react/shallow';
import { usePackStore } from '@/stores/pack-store';
import { useEditorStore } from '@/stores/editor-store';
import { useThemeStore } from '@/stores/theme-store';
import { useNodeTypes } from '@/canvas/MachineNode';
import { buildMachinePortDisplaysForNode } from '@/canvas/port-label-stubs';
import {
  buildBufferPortDisplays,
  formatBufferRate,
} from '@/canvas/BufferNode';
import { EditorCanvas } from '@/canvas/EditorCanvas';
import { FlowEdge } from '@/canvas/FlowEdge';
import {
  NodeDisplayProvider,
  type NodeDynamicDisplay,
} from '@/canvas/node-display-context';
import {
  EditorNodeActionsProvider,
  type EditorNodeActions,
} from '@/canvas/editor-node-actions-context';
import { buildSchemeObstacleRects } from '@/canvas/scheme-obstacles';
import {
  PortContextMenu,
  bufferKindsForPort,
  type PortAttachDirection,
} from '@/canvas/PortContextMenu';
import { buildNodeLoadMeta } from '@/canvas/flow-display';
import { normalizePortId } from '@/lib/ports';
import { buildFlowDisplayPipeline } from '@/lib/flow-display-pipeline';
import {
  buildLayoutWidthInput,
  getCachedMachineNodeLayoutWidths,
} from '@/lib/layout-width-cache';
import { buildStableRfNodes } from '@/lib/stable-rf-nodes';
import { schemeFlowRevision } from '@/lib/scheme-flow-revision';
import { downloadTfgp } from '@/schema/tfgp';
import { pickTfgpFile, readTfgpFile } from '@/lib/read-tfgp-file';
import { getMachineName, getRecipe, getMachineRecipeCount } from '@/data/pack-registry';
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
import { R } from '@/calculator/rational';
import {
  type AttachCandidate,
} from '@/lib/recipe-index';
import { buildTagIndexFromMeta, buildTagIndexForRecipes } from '@/lib/tag-index';
import { findAttachCandidatesFromIndex } from '@/lib/recipe-index';
import { isPackRuntime } from '@/data/pack-runtime';
import type { Flow } from '@/data/types';
import type { ActivePack } from '@/data/pack-runtime';
import { parsePortId, nodePortFlow, portsMatch } from '@/canvas/ports';
import { isBufferNode, isMachineNode } from '@/lib/node-kind';
import { parsePositiveRate } from '@/lib/parse-positive-rate';
import { preloadSchemeRecipes } from '@/lib/preload-scheme-recipes';
import { isEntryAlignedWithEditor } from '@/lib/pack-selection';
import type { TfgpBufferKind, TfgpEdge, TfgpNode } from '@/schema/tfgp';

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
  pack: ActivePack,
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
  const packError = usePackStore((s) => s.error);
  const {
    scheme,
    flowResult,
    schemeCheckResult,
    selectedNodeIds,
    selectedEdgeIds,
    activePackKey,
    flowComputeState,
  } = useEditorStore(
    useShallow((s) => ({
      scheme: s.scheme,
      flowResult: s.flowResult,
      schemeCheckResult: s.schemeCheckResult,
      selectedNodeIds: s.selectedNodeIds,
      selectedEdgeIds: s.selectedEdgeIds,
      activePackKey: s.activePackKey,
      flowComputeState: s.flowComputeState,
    })),
  );
  const editorActions = useMemo(
    () => ({
      setNodes: (...args: Parameters<ReturnType<typeof useEditorStore.getState>['setNodes']>) =>
        useEditorStore.getState().setNodes(...args),
      setViewport: (...args: Parameters<ReturnType<typeof useEditorStore.getState>['setViewport']>) =>
        useEditorStore.getState().setViewport(...args),
      addNode: (...args: Parameters<ReturnType<typeof useEditorStore.getState>['addNode']>) =>
        useEditorStore.getState().addNode(...args),
      updateNode: (...args: Parameters<ReturnType<typeof useEditorStore.getState>['updateNode']>) =>
        useEditorStore.getState().updateNode(...args),
      removeNodes: (...args: Parameters<ReturnType<typeof useEditorStore.getState>['removeNodes']>) =>
        useEditorStore.getState().removeNodes(...args),
      removeEdges: (...args: Parameters<ReturnType<typeof useEditorStore.getState>['removeEdges']>) =>
        useEditorStore.getState().removeEdges(...args),
      addEdge: (...args: Parameters<ReturnType<typeof useEditorStore.getState>['addEdge']>) =>
        useEditorStore.getState().addEdge(...args),
      attachMachine: (...args: Parameters<ReturnType<typeof useEditorStore.getState>['attachMachine']>) =>
        useEditorStore.getState().attachMachine(...args),
      attachBuffer: (...args: Parameters<ReturnType<typeof useEditorStore.getState>['attachBuffer']>) =>
        useEditorStore.getState().attachBuffer(...args),
      pushHistory: () => useEditorStore.getState().pushHistory(),
      undo: () => useEditorStore.getState().undo(),
      redo: () => useEditorStore.getState().redo(),
      setTarget: (...args: Parameters<ReturnType<typeof useEditorStore.getState>['setTarget']>) =>
        useEditorStore.getState().setTarget(...args),
      duplicateSelected: () => useEditorStore.getState().duplicateSelected(),
      loadScheme: (...args: Parameters<ReturnType<typeof useEditorStore.getState>['loadScheme']>) =>
        useEditorStore.getState().loadScheme(...args),
      clearScheme: () => useEditorStore.getState().clearScheme(),
      setSchemeName: (...args: Parameters<ReturnType<typeof useEditorStore.getState>['setSchemeName']>) =>
        useEditorStore.getState().setSchemeName(...args),
      setSelectedNodeIds: (...args: Parameters<ReturnType<typeof useEditorStore.getState>['setSelectedNodeIds']>) =>
        useEditorStore.getState().setSelectedNodeIds(...args),
      setSelectedEdgeIds: (...args: Parameters<ReturnType<typeof useEditorStore.getState>['setSelectedEdgeIds']>) =>
        useEditorStore.getState().setSelectedEdgeIds(...args),
      updateFlows: () => useEditorStore.getState().updateFlows(),
      refreshFlowDisplay: () => useEditorStore.getState().refreshFlowDisplay(),
      refreshSchemeCheck: () => useEditorStore.getState().refreshSchemeCheck(),
    }),
    [],
  );
  const {
    setNodes,
    setViewport,
    addNode,
    updateNode,
    removeNodes,
    removeEdges,
    addEdge: addEdgeToStore,
    attachMachine,
    attachBuffer,
    pushHistory,
    undo,
    redo,
    setTarget,
    duplicateSelected,
    loadScheme,
    clearScheme,
    setSchemeName,
    setSelectedNodeIds,
    setSelectedEdgeIds,
    updateFlows,
    refreshFlowDisplay,
    refreshSchemeCheck,
  } = editorActions;
  const [packDisplayEpoch, setPackDisplayEpoch] = useState(0);
  const colorTheme = useThemeStore((s) => s.theme);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasDragDepthRef = useRef(0);
  const [isCanvasDragOver, setIsCanvasDragOver] = useState(false);

  const nodeTypes = useNodeTypes();
  const edgeTypes = useEdgeTypes();

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

  const tagIndex = useMemo(
    () => (pack ? buildTagIndexFromMeta(pack) : null),
    [pack],
  );

  const packSelectionAligned = isEntryAlignedWithEditor(activeEntry, activePackKey);
  const canDeferPackLoad = packSelectionAligned && scheme.nodes.length > 0;

  useEffect(() => {
    if (!pack) return;
    let cancelled = false;
    void (async () => {
      const { scheme, flowResult } = useEditorStore.getState();
      await preloadSchemeRecipes(pack, scheme);
      if (cancelled) return;
      refreshFlowDisplay();
      if (flowResult) {
        refreshSchemeCheck();
      } else if (scheme.nodes.length > 0) {
        updateFlows();
      }
      setPackDisplayEpoch((epoch) => epoch + 1);
    })();
    return () => {
      cancelled = true;
    };
  }, [pack, updateFlows, refreshFlowDisplay, refreshSchemeCheck]);

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
      outPorts.get(e.source)!.add(normalizePortId(e.sourcePort));
      inPorts.get(e.target)!.add(normalizePortId(e.targetPort));
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
      if (!pack || !tagIndex) return;
      const node = scheme.nodes.find((n) => n.id === nodeId);
      if (!node) return;

      void (async () => {
        if (isMachineNode(node)) {
          await pack.loadMachineRecipes(node.machineId);
        }
        await pack.ensureRecipeIds(
          scheme.nodes.filter(isMachineNode).map((n) => n.recipeId),
        );

        const recipe = isMachineNode(node)
          ? getRecipe(pack, node.recipeId)
          : undefined;
        const flow = nodePortFlow(node, portId, recipe);
        if (!flow) return;

        const direction: PortAttachDirection = side === 'out' ? 'downstream' : 'upstream';

        if (isPackRuntime(pack)) {
          await pack.ensureRecipesForPortAttach(flow, direction, tagIndex);
        }

        const attachIndex = await pack.getFlowAttachIndex();
        const recipesById = pack.recipesByIdMap();
        const flowTagIndex = buildTagIndexForRecipes(
          pack,
          [...recipesById.values()],
          tagIndex,
        );
        const candidates = findAttachCandidatesFromIndex(
          pack,
          attachIndex,
          recipesById,
          flow,
          direction,
          lang,
          flowTagIndex,
        );

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
      })();
    },
    [pack, tagIndex, scheme.nodes, lang],
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

  const schemeRevision = useMemo(() => schemeFlowRevision(scheme), [scheme]);

  const layoutWidthByNodeId = useMemo(() => {
    if (!pack) return {};
    return getCachedMachineNodeLayoutWidths(
      buildLayoutWidthInput(
        scheme.nodes,
        scheme.edges,
        schemeRevision,
        lang,
        pack,
        flowResult,
        connectedPorts.inPorts,
        connectedPorts.outPorts,
        t,
        packDisplayEpoch,
      ),
    );
  }, [
    scheme.nodes,
    scheme.edges,
    schemeRevision,
    pack,
    lang,
    flowResult,
    connectedPorts,
    packDisplayEpoch,
    t,
  ]);

  const flowEdgeData = useMemo(() => {
    if (!pack || !flowResult) return {};
    return buildFlowDisplayPipeline(
      scheme,
      pack,
      flowResult,
      lang,
      t,
      layoutWidthByNodeId,
    );
  }, [
    scheme,
    pack,
    flowResult,
    lang,
    t,
    schemeRevision,
    packDisplayEpoch,
    layoutWidthByNodeId,
  ]);

  const editorNodeActions = useMemo<EditorNodeActions>(
    () => ({
      onRecipeChange: handleRecipeChange,
      onMachineCountChange: (nodeId, machineCount) =>
        updateNode(nodeId, { machineCount }),
      onOverclockChange: (nodeId, overclock) => updateNode(nodeId, { overclock }),
      onVoltageTierChange: (nodeId, voltageTier) =>
        updateNode(nodeId, { voltageTier }),
      onCapacityChange: (nodeId, capacity) => updateNode(nodeId, { capacity }),
      onSupplyModeChange: (nodeId, supplyMode) =>
        updateNode(nodeId, { supplyMode }),
      onSupplyRateChange: (nodeId, supplyRate) =>
        updateNode(nodeId, { supplyRate }),
      onInitialStockChange: (nodeId, initialStock) =>
        updateNode(nodeId, { initialStock }),
      onPortContextMenu: handlePortContextMenu,
    }),
    [handleRecipeChange, handlePortContextMenu, updateNode],
  );

  const nodeDisplayById = useMemo(() => {
    if (!pack) return {};
    const map: Record<string, NodeDynamicDisplay> = {};
    for (const n of scheme.nodes) {
      const connectedIn = connectedPorts.inPorts.get(n.id) ?? new Set();
      const connectedOut = connectedPorts.outPorts.get(n.id) ?? new Set();

      if (isBufferNode(n)) {
        const inRate = formatBufferRate(
          flowResult?.nodeInputRates[n.id]
            ? Object.values(flowResult.nodeInputRates[n.id]!)[0]
            : undefined,
        );
        const outRate = formatBufferRate(
          flowResult?.nodePortOutputRates[n.id]?.out_0,
        );
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
        map[n.id] = {
          inputPorts,
          outputPorts,
          balanceLines: [],
          loadPercent,
          loadLabel:
            loadPercent != null
              ? t('editor.nodeLoadMeta', {
                  value: `${Math.round(loadPercent)}%`,
                })
              : undefined,
        };
        continue;
      }

      const recipe = getRecipe(pack, n.recipeId);
      const nodeLoadMeta = flowResult
        ? buildNodeLoadMeta(n.id, recipe, flowResult, t)
        : undefined;
      const bundle = buildMachinePortDisplaysForNode(
        n,
        scheme.edges,
        pack,
        lang,
        connectedIn,
        connectedOut,
        flowResult ?? undefined,
        flowResult ? t : undefined,
      );
      map[n.id] = {
        inputPorts: bundle.inputPorts,
        outputPorts: bundle.outputPorts,
        balanceLines: bundle.balanceLines,
        loadPercent: nodeLoadMeta?.currentLoadPercent,
        loadLabel: nodeLoadMeta?.label,
        loadTitle: nodeLoadMeta?.title,
      };
    }
    return map;
  }, [
    scheme.nodes,
    scheme.edges,
    pack,
    connectedPorts,
    flowResult,
    lang,
    packDisplayEpoch,
    t,
  ]);

  const rfNodeCacheRef = useRef(new Map<string, { sig: string; node: Node }>());

  const obstacleRects = useMemo(
    () =>
      pack
        ? {
            obstacles: buildSchemeObstacleRects(
              scheme.nodes,
              pack,
              layoutWidthByNodeId,
              nodeDisplayById,
            ),
            skipObstacleRouting: false,
          }
        : { obstacles: [], skipObstacleRouting: false },
    [scheme.nodes, pack, layoutWidthByNodeId, nodeDisplayById],
  );

  const rfNodes: Node[] = useMemo(() => {
    if (!pack) return [];
    return buildStableRfNodes(
      scheme.nodes,
      rfNodeCacheRef.current,
      {
        pack,
        edges: scheme.edges,
        layoutWidthByNodeId,
      },
      (id) => pickNodeIssueMeta(id, schemeCheckResult, pack, lang, scheme.nodes, scheme.edges, t) ?? {},
    );
  }, [scheme.nodes, scheme.edges, pack, schemeCheckResult, layoutWidthByNodeId, packDisplayEpoch, lang, t]);

  const rfEdges: Edge[] = useMemo(
    () =>
      scheme.edges.map((e) => {
        const edgeIssue = pickEdgeIssueMeta(
          e.id,
          schemeCheckResult,
          pack,
          lang,
          scheme.nodes,
          scheme.edges,
          t,
        );
        const baseData = flowEdgeData[e.id] ?? {};
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: normalizePortId(e.sourcePort),
          targetHandle: normalizePortId(e.targetPort),
          type: 'flow',
          data: {
            ...baseData,
            checkSeverity: edgeIssue?.severity,
            checkTitle: edgeIssue?.title,
          },
          animated: Boolean(flowEdgeData[e.id]?.source) && !edgeIssue,
        };
      }),
    [scheme.edges, flowEdgeData, schemeCheckResult, pack, lang, scheme.nodes, t],
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
      const srcRecipe = pack && isMachineNode(srcNode)
        ? getRecipe(pack, srcNode.recipeId)
        : undefined;
      const tgtRecipe = pack && isMachineNode(tgtNode)
        ? getRecipe(pack, tgtNode.recipeId)
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
      const srcRecipe = pack && isMachineNode(srcNode)
        ? getRecipe(pack, srcNode.recipeId)
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

  const handleEdgeRateApply = useCallback(
    (edge: TfgpEdge, rate: number) => {
      setTarget({
        nodeId: edge.target,
        itemId: edge.itemId,
        fluidId: edge.fluidId,
        ratePerSecond: rate,
      });
    },
    [setTarget],
  );

  const selectedNode = scheme.nodes.find((n) => n.id === selectedNodeIds[0]);

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
        parallel: 1,
        machineCount: 1,
        voltageTier: firstRecipe.energy?.minVoltageTier ?? 'LV',
      });
      setSelectedNodeIds([newId]);
      setMachineExplicitId(null);
      setMachineQuery('');
      setMachineResetKey((k) => k + 1);
    })();
  };

  const importTfgpFile = useCallback(
    async (file: File) => {
      try {
        loadScheme(await readTfgpFile(file));
      } catch (err) {
        alert(err instanceof Error ? err.message : t('editor.importFailed'));
      }
    },
    [loadScheme, t],
  );

  const handleClearScheme = () => {
    if (!window.confirm(t('editor.clearSchemeConfirm'))) return;
    clearScheme();
  };

  const handleSchemeNameBlur = () => {
    const trimmed = scheme.meta.name.trim();
    const normalized = trimmed || 'Untitled';
    if (normalized !== scheme.meta.name) {
      setSchemeName(normalized);
    }
  };

  const handleImport = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    void importTfgpFile(file);
    e.target.value = '';
  };

  const hasFileDrag = (e: DragEvent) => e.dataTransfer.types.includes('Files');

  const handleCanvasDragEnter = (e: DragEvent<HTMLDivElement>) => {
    if (!hasFileDrag(e)) return;
    e.preventDefault();
    canvasDragDepthRef.current += 1;
    setIsCanvasDragOver(true);
  };

  const handleCanvasDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!hasFileDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleCanvasDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (!hasFileDrag(e)) return;
    e.preventDefault();
    canvasDragDepthRef.current -= 1;
    if (canvasDragDepthRef.current <= 0) {
      canvasDragDepthRef.current = 0;
      setIsCanvasDragOver(false);
    }
  };

  const handleCanvasDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    canvasDragDepthRef.current = 0;
    setIsCanvasDragOver(false);
    const file = pickTfgpFile(e.dataTransfer.files);
    if (!file) return;
    void importTfgpFile(file);
  };

  if (!pack && !canDeferPackLoad) {
    if (activeEntry && packError) {
      return (
        <div className="editor-page editor-page--empty">
          <div className="alert editor-empty-alert">
            <p>{packError}</p>
            <Link to="/" className="btn">
              {t('editor.selectPackOnHome')}
            </Link>
          </div>
        </div>
      );
    }
    if (activeEntry && !packSelectionAligned) {
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
    if (activeEntry) {
      return (
        <div className="editor-page editor-page--empty">
          <div className="alert editor-empty-alert">
            <p>{t('editor.restoringPack', { version: activeEntry.modpackVersion })}</p>
          </div>
        </div>
      );
    }
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
      <div className="editor-body">
        <div
          className={`editor-canvas-wrap${isCanvasDragOver ? ' editor-canvas-wrap--drop-target' : ''}`}
          onDragEnter={handleCanvasDragEnter}
          onDragOver={handleCanvasDragOver}
          onDragLeave={handleCanvasDragLeave}
          onDrop={handleCanvasDrop}
        >
          {isCanvasDragOver && (
            <div className="editor-canvas-drop-overlay" aria-hidden="true">
              {t('editor.dropScheme')}
            </div>
          )}
          {flowResult?.nonConverged && (
            <div className="editor-canvas-notice editor-canvas-notice--warning" role="alert">
              {t('editor.flowNonConverged')}
            </div>
          )}
          {!pack && activeEntry && canDeferPackLoad && (
            <div className="editor-canvas-notice" role="status" aria-live="polite">
              {t('editor.restoringPack', { version: activeEntry.modpackVersion })}
              <span className="editor-canvas-notice__dots" aria-hidden="true">
                <span>.</span>
                <span>.</span>
                <span>.</span>
              </span>
            </div>
          )}
          <EditorNodeActionsProvider value={editorNodeActions}>
            <NodeDisplayProvider value={nodeDisplayById}>
              <EditorCanvas
                rfNodes={rfNodes}
                rfEdges={rfEdges}
                selectedNodeIds={selectedNodeIds}
                selectedEdgeIds={selectedEdgeIds}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                colorTheme={colorTheme}
                viewport={scheme.viewport}
                obstacleRects={obstacleRects}
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
            </NodeDisplayProvider>
          </EditorNodeActionsProvider>
        </div>
        <aside className="editor-sidebar editor-sidebar-panel">
          <section className="editor-sidebar-section editor-sidebar-section--scheme">
            <div className="editor-sidebar-section__header">
              <h3>{t('editor.schemeEditor')}</h3>
            </div>
            <div className="editor-sidebar-section__body">
              <div className="editor-scheme-name">
                <label htmlFor="scheme-name-input">{t('editor.schemeName')}</label>
                <input
                  id="scheme-name-input"
                  name="scheme-name"
                  type="text"
                  value={scheme.meta.name}
                  onChange={(e) => setSchemeName(e.target.value)}
                  onBlur={handleSchemeNameBlur}
                  placeholder={t('editor.schemeNamePlaceholder')}
                  spellCheck={false}
                />
              </div>
              <SchemeIssuesPanel
                pack={pack}
                lang={lang}
                nodes={scheme.nodes}
                edges={scheme.edges}
                schemeCheck={schemeCheckResult}
                onFocusIssue={handleFocusIssue}
              />
            </div>
          </section>
          <section className="editor-sidebar-section editor-sidebar-section--element">
            <div className="editor-sidebar-section__header">
              <h3>{t('editor.elementEditor')}</h3>
            </div>
            <div className="editor-sidebar-section__body">
              {pack && (
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
                  onEdgeRateApply={handleEdgeRateApply}
                />
              )}
            </div>
          </section>
        </aside>
      </div>
      {portMenu && pack && (
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
