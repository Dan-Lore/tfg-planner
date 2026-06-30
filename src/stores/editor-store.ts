import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TfgpFile, TfgpMachineNode, TfgpNode, TfgpEdge, TfgpTarget } from '@/schema/tfgp';
import { createEmptyTfgp } from '@/schema/tfgp';
import { packKey } from '@/lib/pack-key';
import { readPersistedEditorSnapshot, type PersistedPackFlowCache } from '@/lib/editor-persist';
import { schemeFlowRevision } from '@/lib/scheme-flow-revision';
import {
  allocateEdgeId,
  allocateNodeId,
  dedupeSchemeTopology,
  normalizeSchemeNodes,
  seedIdCounter,
  type EditorSnapshot,
} from './editor-utils';
import { normalizeNodeScaling } from '@/lib/node-scaling';
import { shouldApplyFlowResult } from '@/lib/flow-compute-guard';
import { pruneInvalidEdges } from '@/lib/prune-edges';
import { normalizeNodeVoltage, patchForRecipeChange } from '@/lib/node-voltage';
import { defaultVoltageTierForRecipe } from '@/calculator/energy';
import type { FlowResult } from '@/calculator/flow-solver';
import type { SchemeCheckResult } from '@/scheme-check/check-scheme';
import { usePackStore } from './pack-store';
import { isBufferNode, isMachineNode } from '@/lib/node-kind';
import {
  estimateBufferDefaults,
  clampNonNegativeInt,
} from '@/lib/buffer-defaults';
import type { TfgpBufferKind } from '@/schema/tfgp';
import { normalizeBufferNode } from '@/lib/node-scaling';
import { getRecipe } from '@/data/pack-registry';
import { debounceFlowUpdate } from '@/lib/debounce-flow-update';
import { mergePendingFlowUpdateMode } from '@/lib/flow-compute-queue';
import { computeFlowsAsync, type FlowComputeMode } from '@/lib/flow-compute';
import { hydrateFlowResult, dehydrateFlowResult } from '@/calculator/flow-result-transfer';

const MAX_HISTORY = 50;

export type FlowComputeState = 'idle' | 'computing' | 'stale';

interface EditorState {
  scheme: TfgpFile;
  activePackKey: string | null;
  schemesByPack: Record<string, TfgpFile>;
  flowsByPack: Record<string, PersistedPackFlowCache>;
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  flowResult: FlowResult | null;
  schemeCheckResult: SchemeCheckResult | null;
  flowComputeState: FlowComputeState;
  past: EditorSnapshot[];
  future: EditorSnapshot[];
  switchToPack: (modpackVersion: string, dataVersion: number) => void;
  loadScheme: (file: TfgpFile) => void;
  clearScheme: () => void;
  snapshot: () => EditorSnapshot;
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  setNodes: (nodes: TfgpNode[]) => void;
  setEdges: (edges: TfgpEdge[]) => void;
  setViewport: (viewport: TfgpFile['viewport']) => void;
  addNode: (node: Omit<TfgpMachineNode, 'id'>) => string;
  updateNode: (id: string, patch: Partial<TfgpNode>) => void;
  removeNodes: (ids: string[]) => void;
  addEdge: (edge: Omit<TfgpEdge, 'id'>) => void;
  attachMachine: (params: {
    machineId: string;
    recipeId: string;
    position: { x: number; y: number };
    anchorNodeId: string;
    anchorPort: string;
    newPort: string;
    direction: 'upstream' | 'downstream';
    itemId?: string;
    fluidId?: string;
  }) => string;
  attachBuffer: (params: {
    bufferKind: TfgpBufferKind;
    position: { x: number; y: number };
    anchorNodeId: string;
    anchorPort: string;
    direction: 'upstream' | 'downstream';
    itemId?: string;
    fluidId?: string;
  }) => string;
  removeEdge: (id: string) => void;
  removeEdges: (ids: string[]) => void;
  setSelectedNodeIds: (ids: string[]) => void;
  setSelectedEdgeIds: (ids: string[]) => void;
  setTarget: (target: TfgpTarget) => void;
  /** Refresh port/edge rates from current node settings; does not change machine counts. */
  updateFlows: () => void;
  /** @deprecated No-op — edge labels are derived in EditorPage from flowResult. */
  refreshFlowDisplay: () => void;
  /** Full scheme solve from targets; updates machine counts across the graph. */
  recalculateScheme: () => void;
  duplicateSelected: () => void;
  setSchemeName: (name: string) => void;
}

function cacheFlows(
  flowsByPack: Record<string, PersistedPackFlowCache>,
  key: string | null,
  scheme: TfgpFile,
  flowResult: FlowResult,
): Record<string, PersistedPackFlowCache> {
  if (!key) return flowsByPack;
  return {
    ...flowsByPack,
    [key]: {
      revision: schemeFlowRevision(scheme),
      flowResult: dehydrateFlowResult(flowResult) as unknown as FlowResult,
    },
  };
}

function restoreFlowsForScheme(
  flowsByPack: Record<string, PersistedPackFlowCache>,
  key: string | null,
  scheme: TfgpFile,
): Pick<EditorState, 'flowResult' | 'flowComputeState'> {
  if (!key) {
    return { flowResult: null, flowComputeState: 'idle' };
  }
  const cached = flowsByPack[key];
  const revision = schemeFlowRevision(scheme);
  if (!cached) {
    return { flowResult: null, flowComputeState: 'idle' };
  }
  if (!cached || cached.revision !== revision) {
    return { flowResult: null, flowComputeState: 'idle' };
  }
  return {
    flowResult: hydrateFlowResult(cached.flowResult),
    flowComputeState: 'idle',
  };
}

function cacheScheme(
  schemesByPack: Record<string, TfgpFile>,
  key: string | null,
  scheme: TfgpFile,
): Record<string, TfgpFile> {
  if (!key) return schemesByPack;
  return { ...schemesByPack, [key]: structuredClone(scheme) };
}

let debouncedFlowUpdate: ReturnType<typeof debounceFlowUpdate> | null = null;
let flowComputeBinding: {
  get: () => EditorState;
  set: (partial: Partial<EditorState> | ((s: EditorState) => Partial<EditorState>)) => void;
} | null = null;
let pendingFlowUpdateMode: FlowComputeMode | null = null;

function flushPendingFlowUpdate(): void {
  const mode = pendingFlowUpdateMode;
  if (!mode) return;
  pendingFlowUpdateMode = null;
  scheduleFlowUpdate(mode);
}

async function runFlowCompute(mode: FlowComputeMode): Promise<void> {
  const binding = flowComputeBinding;
  if (!binding) return;
  const pack = usePackStore.getState().activePack;
  if (!pack) return;

  binding.set({ flowComputeState: 'computing' });
  const { scheme } = binding.get();
  const revisionAtStart = schemeFlowRevision(scheme);
  const snap = binding.get().snapshot();

  try {
    const packSlice = await pack.getSchemeSlice(scheme);
    const response = await computeFlowsAsync({
      snapshot: snap,
      scheme,
      packSlice,
      mode,
    });
    if (!response) {
      binding.set({ flowComputeState: 'stale' });
      flushPendingFlowUpdate();
      return;
    }

    const currentRevision = schemeFlowRevision(binding.get().scheme);
    if (!shouldApplyFlowResult(revisionAtStart, currentRevision)) {
      binding.set({ flowComputeState: 'stale' });
      flushPendingFlowUpdate();
      return;
    }

    const flowResult = hydrateFlowResult(response.flowResult);

    const schemeForEdges =
      mode === 'recalculate' && response.nodes
        ? { ...scheme, nodes: response.nodes }
        : scheme;

    binding.set({
      flowComputeState: 'idle',
      flowResult,
      schemeCheckResult: response.schemeCheckResult,
      flowsByPack: cacheFlows(
        binding.get().flowsByPack,
        binding.get().activePackKey,
        schemeForEdges,
        flowResult,
      ),
      ...(mode === 'recalculate' && response.nodes
        ? {
            scheme: schemeForEdges,
            schemesByPack: cacheScheme(
              binding.get().schemesByPack,
              binding.get().activePackKey,
              schemeForEdges,
            ),
          }
        : {
            schemesByPack: cacheScheme(
              binding.get().schemesByPack,
              binding.get().activePackKey,
              scheme,
            ),
          }),
    });
    flushPendingFlowUpdate();
  } catch (err) {
    console.error('Flow compute failed:', err);
    binding.set({ flowComputeState: 'idle' });
    flushPendingFlowUpdate();
  }
}

function queueFlowUpdateWhileBusy(mode: FlowComputeMode): void {
  pendingFlowUpdateMode = mergePendingFlowUpdateMode(pendingFlowUpdateMode, mode);
  flowComputeBinding?.set({ flowComputeState: 'stale' });
}

function scheduleFlowUpdate(mode: FlowComputeMode): void {
  if (flowComputeBinding?.get().flowComputeState === 'computing') {
    queueFlowUpdateWhileBusy(mode);
    return;
  }
  if (mode === 'recalculate') {
    debouncedFlowUpdate?.cancel();
    void runFlowCompute('recalculate');
    return;
  }
  if (!debouncedFlowUpdate) return;
  flowComputeBinding?.set({ flowComputeState: 'stale' });
  debouncedFlowUpdate();
}

const persistedEditor = readPersistedEditorSnapshot();
const initialSchemeRaw =
  persistedEditor.scheme ?? createEmptyTfgp('0.12.8', 1);
const initialScheme = {
  ...initialSchemeRaw,
  nodes: normalizeSchemeNodes(initialSchemeRaw.nodes),
};
if (persistedEditor.scheme) {
  seedIdCounter(initialScheme.nodes, initialScheme.edges);
}
const initialFlows = restoreFlowsForScheme(
  persistedEditor.flowsByPack,
  persistedEditor.activePackKey,
  initialScheme,
);

export const useEditorStore = create<EditorState>()(
  persist(
    (set, get) => ({
      scheme: initialScheme,
      activePackKey: persistedEditor.activePackKey,
      schemesByPack: persistedEditor.schemesByPack,
      flowsByPack: persistedEditor.flowsByPack,
      selectedNodeIds: [],
      selectedEdgeIds: [],
      flowResult: initialFlows.flowResult,
      schemeCheckResult: null,
      flowComputeState: initialFlows.flowComputeState,
      past: [],
      future: [],

      switchToPack: (modpackVersion, dataVersion) => {
        const { scheme, activePackKey, schemesByPack, flowsByPack } = get();
        const updatedCache = cacheScheme(schemesByPack, activePackKey, scheme);
        const newKey = packKey(modpackVersion, dataVersion);
        const cached = updatedCache[newKey];
        const pack = usePackStore.getState().activePack;
        const nextScheme = cached
          ? { ...cached, nodes: normalizeSchemeNodes(cached.nodes, pack) }
          : createEmptyTfgp(modpackVersion, dataVersion);
        seedIdCounter(nextScheme.nodes, nextScheme.edges);
        const restoredFlows = restoreFlowsForScheme(flowsByPack, newKey, nextScheme);

        set({
          schemesByPack: updatedCache,
          activePackKey: newKey,
          scheme: nextScheme,
          past: [],
          future: [],
          schemeCheckResult: null,
          selectedNodeIds: [],
          selectedEdgeIds: [],
          ...restoredFlows,
        });
        if (!restoredFlows.flowResult) {
          get().updateFlows();
        }
      },

      loadScheme: (file) => {
        const pack = usePackStore.getState().activePack;
        const normalizedNodes = normalizeSchemeNodes(file.nodes, pack);
        const { nodes, edges, targets } = dedupeSchemeTopology(
          normalizedNodes,
          file.edges,
          file.targets,
        );
        const normalized = { ...file, nodes, edges, targets };
        seedIdCounter(normalized.nodes, normalized.edges);
        const key = packKey(normalized.modpack.version, normalized.modpack.dataVersion);
        set((s) => ({
          scheme: normalized,
          activePackKey: key,
          schemesByPack: cacheScheme(s.schemesByPack, key, normalized),
          past: [],
          future: [],
          selectedNodeIds: [],
          selectedEdgeIds: [],
        }));
        get().updateFlows();
      },

      clearScheme: () => {
        const { scheme, activePackKey, schemesByPack } = get();
        const cleared = createEmptyTfgp(
          scheme.modpack.version,
          scheme.modpack.dataVersion,
        );
        seedIdCounter(cleared.nodes, cleared.edges);
        set({
          scheme: cleared,
          schemesByPack: cacheScheme(schemesByPack, activePackKey, cleared),
          past: [],
          future: [],
          flowResult: null,
          schemeCheckResult: null,
          selectedNodeIds: [],
          selectedEdgeIds: [],
        });
      },

      snapshot: () => {
        const { scheme } = get();
        return {
          nodes: structuredClone(scheme.nodes),
          edges: structuredClone(scheme.edges),
          targets: structuredClone(scheme.targets),
          viewport: { ...scheme.viewport },
        };
      },

      pushHistory: () => {
        const snap = get().snapshot();
        set((s) => ({
          past: [...s.past.slice(-MAX_HISTORY + 1), snap],
          future: [],
        }));
      },

      undo: () => {
        const { past, future } = get();
        if (past.length === 0) return;
        const prev = past[past.length - 1];
        const current = get().snapshot();
        set((s) => ({
          scheme: {
            ...s.scheme,
            nodes: prev.nodes,
            edges: prev.edges,
            targets: prev.targets,
            viewport: prev.viewport,
          },
          schemesByPack: cacheScheme(s.schemesByPack, s.activePackKey, {
            ...s.scheme,
            nodes: prev.nodes,
            edges: prev.edges,
            targets: prev.targets,
            viewport: prev.viewport,
          }),
          past: past.slice(0, -1),
          future: [current, ...future],
        }));
        get().updateFlows();
      },

      redo: () => {
        const { future, past } = get();
        if (future.length === 0) return;
        const next = future[0];
        const current = get().snapshot();
        set((s) => ({
          scheme: {
            ...s.scheme,
            nodes: next.nodes,
            edges: next.edges,
            targets: next.targets,
            viewport: next.viewport,
          },
          schemesByPack: cacheScheme(s.schemesByPack, s.activePackKey, {
            ...s.scheme,
            nodes: next.nodes,
            edges: next.edges,
            targets: next.targets,
            viewport: next.viewport,
          }),
          past: [...past, current],
          future: future.slice(1),
        }));
        get().updateFlows();
      },

      setNodes: (nodes) => {
        set((s) => {
          const scheme = { ...s.scheme, nodes };
          return {
            scheme,
            schemesByPack: cacheScheme(s.schemesByPack, s.activePackKey, scheme),
          };
        });
      },

      setEdges: (edges) => {
        set((s) => {
          const scheme = { ...s.scheme, edges };
          return {
            scheme,
            schemesByPack: cacheScheme(s.schemesByPack, s.activePackKey, scheme),
          };
        });
      },

      setViewport: (viewport) => {
        set((s) => {
          const scheme = { ...s.scheme, viewport };
          return {
            scheme,
            schemesByPack: cacheScheme(s.schemesByPack, s.activePackKey, scheme),
          };
        });
      },

      addNode: (partial) => {
        get().pushHistory();
        const { scheme } = get();
        const pack = usePackStore.getState().activePack;
        const recipe = pack ? getRecipe(pack, partial.recipeId) : undefined;
        const id = allocateNodeId(scheme.nodes, scheme.edges);
        const node: TfgpMachineNode = normalizeNodeVoltage(
          {
            ...partial,
            id,
            machineCount: partial.machineCount ?? 1,
            overclock: partial.overclock ?? 1,
            parallel: partial.parallel ?? 1,
            voltageTier:
              partial.voltageTier ??
              (recipe ? defaultVoltageTierForRecipe(recipe) : 'LV'),
          },
          recipe,
        );
        set((s) => {
          const scheme = { ...s.scheme, nodes: [...s.scheme.nodes, node] };
          return {
            scheme,
            schemesByPack: cacheScheme(s.schemesByPack, s.activePackKey, scheme),
          };
        });
        get().updateFlows();
        return id;
      },

      updateNode: (id, patch) => {
        get().pushHistory();
        set((s) => {
          const pack = usePackStore.getState().activePack;
          let scheme = {
            ...s.scheme,
            nodes: s.scheme.nodes.map((n) => {
              if (n.id !== id) return n;
              if (isBufferNode(n)) {
                let next = { ...n, ...patch } as typeof n;
                if ('capacity' in patch && patch.capacity != null) {
                  next = { ...next, capacity: clampNonNegativeInt(patch.capacity) };
                }
                if (next.kind === 'start_buffer') {
                  if ('supplyRate' in patch && patch.supplyRate != null) {
                    next = {
                      ...next,
                      supplyRate: clampNonNegativeInt(patch.supplyRate),
                      autoSupplyRate: false,
                    };
                  }
                  if ('initialStock' in patch && patch.initialStock != null) {
                    next = {
                      ...next,
                      initialStock: clampNonNegativeInt(patch.initialStock),
                    };
                  }
                }
                return normalizeBufferNode(next);
              }
              if (!isMachineNode(n)) return n;
              let next: TfgpMachineNode = { ...n, ...(patch as Partial<TfgpMachineNode>) };
              if ('parallel' in patch && patch.parallel != null) {
                next = normalizeNodeScaling(next) as TfgpMachineNode;
              }
              if ('recipeId' in patch && patch.recipeId && pack) {
                const recipe = getRecipe(pack, patch.recipeId);
                next = { ...next, ...patchForRecipeChange(recipe, n) };
              } else if (
                ('voltageTier' in patch && patch.voltageTier) ||
                !('recipeId' in patch)
              ) {
                const recipe = pack ? getRecipe(pack, next.recipeId) : undefined;
                next = normalizeNodeVoltage(next, recipe);
              }
              return next;
            }),
          };
          if ('recipeId' in patch && patch.recipeId) {
            const pack = usePackStore.getState().activePack;
            if (pack) {
              scheme = {
                ...scheme,
                edges: pruneInvalidEdges(scheme.edges, scheme.nodes, pack),
              };
            }
          }
          return {
            scheme,
            schemesByPack: cacheScheme(s.schemesByPack, s.activePackKey, scheme),
          };
        });
        get().updateFlows();
      },

      removeNodes: (ids) => {
        get().pushHistory();
        const idSet = new Set(ids);
        set((s) => {
          const scheme = {
            ...s.scheme,
            nodes: s.scheme.nodes.filter((n) => !idSet.has(n.id)),
            edges: s.scheme.edges.filter(
              (e) => !idSet.has(e.source) && !idSet.has(e.target),
            ),
          };
          return {
            scheme,
            schemesByPack: cacheScheme(s.schemesByPack, s.activePackKey, scheme),
            selectedNodeIds: s.selectedNodeIds.filter((nid) => !idSet.has(nid)),
            selectedEdgeIds: s.selectedEdgeIds.filter((eid) =>
              scheme.edges.some((e) => e.id === eid),
            ),
          };
        });
        get().updateFlows();
      },

      addEdge: (partial) => {
        get().pushHistory();
        const { scheme } = get();
        const edge: TfgpEdge = {
          id: allocateEdgeId(scheme.nodes, scheme.edges),
          ...partial,
        };
        set((s) => {
          const scheme = { ...s.scheme, edges: [...s.scheme.edges, edge] };
          return {
            scheme,
            schemesByPack: cacheScheme(s.schemesByPack, s.activePackKey, scheme),
          };
        });
        get().updateFlows();
      },

      attachMachine: (params) => {
        get().pushHistory();
        const { scheme } = get();
        const nodeId = allocateNodeId(scheme.nodes, scheme.edges);
        const edgeId = allocateEdgeId(scheme.nodes, scheme.edges);
        const node: TfgpNode = normalizeNodeVoltage(
          {
            id: nodeId,
            machineId: params.machineId,
            recipeId: params.recipeId,
            position: params.position,
            machineCount: 1,
            overclock: 1,
            parallel: 1,
            voltageTier: 'LV',
          },
          usePackStore.getState().activePack
            ? getRecipe(usePackStore.getState().activePack!, params.recipeId)
            : undefined,
        );
        const edge: TfgpEdge =
          params.direction === 'downstream'
            ? {
                id: edgeId,
                source: params.anchorNodeId,
                sourcePort: params.anchorPort,
                target: nodeId,
                targetPort: params.newPort,
                itemId: params.itemId,
                fluidId: params.fluidId,
              }
            : {
                id: edgeId,
                source: nodeId,
                sourcePort: params.newPort,
                target: params.anchorNodeId,
                targetPort: params.anchorPort,
                itemId: params.itemId,
                fluidId: params.fluidId,
              };
        set((s) => {
          const scheme = {
            ...s.scheme,
            nodes: [...s.scheme.nodes, node],
            edges: [...s.scheme.edges, edge],
          };
          return {
            scheme,
            schemesByPack: cacheScheme(s.schemesByPack, s.activePackKey, scheme),
          };
        });
        get().updateFlows();
        return nodeId;
      },

      attachBuffer: (params) => {
        get().pushHistory();
        const { scheme, flowResult } = get();
        const defaults = estimateBufferDefaults(
          params.anchorNodeId,
          params.anchorPort,
          params.direction,
          scheme,
          flowResult,
        );
        const nodeId = allocateNodeId(scheme.nodes, scheme.edges);
        const edgeId = allocateEdgeId(scheme.nodes, scheme.edges);

        const base = {
          id: nodeId,
          position: params.position,
          itemId: params.itemId,
          fluidId: params.fluidId,
          capacity: defaults.capacity,
        };

        let node: TfgpNode;
        if (params.bufferKind === 'start_buffer') {
          node = normalizeBufferNode({
            ...base,
            kind: 'start_buffer',
            supplyMode: 'rate',
            supplyRate: defaults.supplyRate,
            autoSupplyRate: true,
          });
        } else if (params.bufferKind === 'intermediate_buffer') {
          node = normalizeBufferNode({
            ...base,
            kind: 'intermediate_buffer',
          });
        } else {
          node = normalizeBufferNode({
            ...base,
            kind: 'end_buffer',
          });
        }

        const bufferOutPort = 'out_0';
        const bufferInPort = 'in_0';
        const edge: TfgpEdge =
          params.direction === 'downstream'
            ? {
                id: edgeId,
                source: params.anchorNodeId,
                sourcePort: params.anchorPort,
                target: nodeId,
                targetPort: bufferInPort,
                itemId: params.itemId,
                fluidId: params.fluidId,
              }
            : {
                id: edgeId,
                source: nodeId,
                sourcePort: bufferOutPort,
                target: params.anchorNodeId,
                targetPort: params.anchorPort,
                itemId: params.itemId,
                fluidId: params.fluidId,
              };

        set((s) => {
          const scheme = {
            ...s.scheme,
            nodes: [...s.scheme.nodes, node],
            edges: [...s.scheme.edges, edge],
          };
          return {
            scheme,
            schemesByPack: cacheScheme(s.schemesByPack, s.activePackKey, scheme),
          };
        });
        get().updateFlows();
        return nodeId;
      },

      removeEdge: (id) => {
        get().removeEdges([id]);
      },

      removeEdges: (ids) => {
        if (ids.length === 0) return;
        get().pushHistory();
        const idSet = new Set(ids);
        set((s) => {
          const scheme = {
            ...s.scheme,
            edges: s.scheme.edges.filter((e) => !idSet.has(e.id)),
          };
          return {
            scheme,
            schemesByPack: cacheScheme(s.schemesByPack, s.activePackKey, scheme),
            selectedEdgeIds: s.selectedEdgeIds.filter((eid) => !idSet.has(eid)),
          };
        });
        get().updateFlows();
      },

      setSelectedNodeIds: (ids) => set({ selectedNodeIds: ids }),

      setSelectedEdgeIds: (ids) => set({ selectedEdgeIds: ids }),

      setTarget: (target) => {
        get().pushHistory();
        set((s) => {
          const rest = s.scheme.targets.filter((t) => t.nodeId !== target.nodeId);
          const scheme = {
            ...s.scheme,
            targets: [...rest, target],
          };
          return {
            scheme,
            schemesByPack: cacheScheme(s.schemesByPack, s.activePackKey, scheme),
          };
        });
        get().recalculateScheme();
      },

      updateFlows: () => {
        const { scheme, activePackKey, flowsByPack, flowResult, flowComputeState } = get();
        if (flowComputeState === 'computing') {
          queueFlowUpdateWhileBusy('update');
          return;
        }
        const revision = schemeFlowRevision(scheme);
        const cached = activePackKey ? flowsByPack[activePackKey] : undefined;
        if (flowResult && flowComputeState === 'idle' && cached?.revision === revision) {
          return;
        }
        scheduleFlowUpdate('update');
      },

      refreshFlowDisplay: () => {
        /* Edge labels derived in EditorPage from flowResult + scheme. */
      },

      recalculateScheme: () => {
        scheduleFlowUpdate('recalculate');
      },

      duplicateSelected: () => {
        const ids = get().selectedNodeIds;
        if (ids.length === 0) return;
        get().pushHistory();
        const idSet = new Set(ids);
        const { scheme } = get();
        const toCopy = scheme.nodes.filter((n) => idSet.has(n.id));
        const newNodes: TfgpNode[] = [];
        for (const n of toCopy) {
          const id = allocateNodeId([...scheme.nodes, ...newNodes], scheme.edges);
          newNodes.push({
            ...n,
            id,
            position: { x: n.position.x + 40, y: n.position.y + 40 },
          });
        }
        set((s) => {
          const scheme = {
            ...s.scheme,
            nodes: [...s.scheme.nodes, ...newNodes],
          };
          return {
            scheme,
            schemesByPack: cacheScheme(s.schemesByPack, s.activePackKey, scheme),
            selectedNodeIds: newNodes.map((n) => n.id),
          };
        });
        get().updateFlows();
      },

      setSchemeName: (name) => {
        set((s) => {
          const scheme = {
            ...s.scheme,
            meta: { ...s.scheme.meta, name },
          };
          return {
            scheme,
            schemesByPack: cacheScheme(s.schemesByPack, s.activePackKey, scheme),
          };
        });
      },
    }),
    {
      name: 'tfg-editor-store',
      partialize: (s) => ({
        schemesByPack: s.schemesByPack,
        activePackKey: s.activePackKey,
        flowsByPack: s.flowsByPack,
      }),
      merge: (persisted, current) => {
        const p = persisted as {
          activePackKey?: string | null;
          schemesByPack?: Record<string, TfgpFile>;
          flowsByPack?: Record<string, PersistedPackFlowCache>;
        } | undefined;
        if (!p) return current;
        const pSchemes = p.schemesByPack ?? {};
        const cSchemes = current.schemesByPack ?? {};
        if (
          Object.keys(pSchemes).length === 0 &&
          Object.keys(cSchemes).length > 0
        ) {
          return current;
        }
        const schemesByPack =
          Object.keys(pSchemes).length >= Object.keys(cSchemes).length
            ? { ...cSchemes, ...pSchemes }
            : { ...pSchemes, ...cSchemes };
        const pFlows = p.flowsByPack ?? {};
        const cFlows = current.flowsByPack ?? {};
        const flowsByPack =
          Object.keys(pFlows).length >= Object.keys(cFlows).length
            ? { ...cFlows, ...pFlows }
            : { ...pFlows, ...cFlows };
        return {
          ...current,
          schemesByPack,
          flowsByPack,
          activePackKey: p.activePackKey ?? current.activePackKey,
        };
      },
      onRehydrateStorage: () => (state) => {
        flowComputeBinding = {
          get: useEditorStore.getState,
          set: (partial) => useEditorStore.setState(partial),
        };
        if (!debouncedFlowUpdate) {
          debouncedFlowUpdate = debounceFlowUpdate(() => {
            void runFlowCompute('update');
          });
        }

        if (!state) return;
        const normalizedCache: Record<string, TfgpFile> = {};
        for (const [key, file] of Object.entries(state.schemesByPack)) {
          normalizedCache[key] = {
            ...file,
            nodes: normalizeSchemeNodes(file.nodes),
          };
        }
        state.schemesByPack = normalizedCache;
        if (!state.activePackKey) return;
        const cached = normalizedCache[state.activePackKey];
        if (cached) {
          state.scheme = cached;
          seedIdCounter(cached.nodes, cached.edges);
        }
        const restored = restoreFlowsForScheme(
          state.flowsByPack ?? {},
          state.activePackKey,
          state.scheme,
        );
        state.flowResult = restored.flowResult;
        state.flowComputeState = restored.flowComputeState;
      },
    },
  ),
);

flowComputeBinding = {
  get: useEditorStore.getState,
  set: (partial) => useEditorStore.setState(partial),
};
debouncedFlowUpdate = debounceFlowUpdate(() => {
  void runFlowCompute('update');
});
