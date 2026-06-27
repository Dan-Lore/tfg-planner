import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TfgpFile, TfgpMachineNode, TfgpNode, TfgpEdge, TfgpTarget } from '@/schema/tfgp';
import { createEmptyTfgp } from '@/schema/tfgp';
import { packKey } from '@/lib/pack-key';
import {
  allocateEdgeId,
  allocateNodeId,
  applyFlowResult,
  dedupeNodeIds,
  normalizeSchemeNodes,
  runSolver,
  seedIdCounter,
  type EditorSnapshot,
} from './editor-utils';
import type { FlowEdgeData } from '@/canvas/FlowEdge';
import {
  buildEdgeFlowData,
} from '@/canvas/flow-display';
import {
  buildConnectedPortMaps,
  buildMachineNodeLayoutWidths,
} from '@/canvas/machine-node-layout';
import i18n from 'i18next';
import { pruneInvalidEdges } from '@/lib/prune-edges';
import { normalizeNodeVoltage, patchForRecipeChange } from '@/lib/node-voltage';
import { defaultVoltageTierForRecipe } from '@/calculator/energy';
import type { FlowResult } from '@/calculator/flow-solver';
import { usePackStore } from './pack-store';
import { isBufferNode, isMachineNode } from '@/lib/node-kind';
import {
  estimateBufferDefaults,
  clampNonNegativeInt,
} from '@/lib/buffer-defaults';
import type { TfgpBufferKind } from '@/schema/tfgp';
import { normalizeBufferNode } from '@/lib/node-scaling';

const MAX_HISTORY = 50;

function buildFlowEdgeData(
  scheme: TfgpFile,
  pack: NonNullable<ReturnType<typeof usePackStore.getState>['activePack']>,
  result: FlowResult,
): Record<string, FlowEdgeData> {
  const lang = i18n.language === 'en' ? 'en' : 'ru';
  const { connectedIn, connectedOut } = buildConnectedPortMaps(scheme.edges);
  const nodeWidths = buildMachineNodeLayoutWidths({
    nodes: scheme.nodes,
    pack,
    lang,
    flowResult: result,
    connectedIn,
    connectedOut,
    t: i18n.t.bind(i18n),
  });
  return buildEdgeFlowData(
    scheme.edges,
    scheme.nodes,
    pack,
    result,
    nodeWidths,
  );
}

interface EditorState {
  scheme: TfgpFile;
  activePackKey: string | null;
  schemesByPack: Record<string, TfgpFile>;
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  flowEdgeData: Record<string, FlowEdgeData>;
  flowResult: FlowResult | null;
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
  /** Full scheme solve from targets; updates machine counts across the graph. */
  recalculateScheme: () => void;
  duplicateSelected: () => void;
}

function cacheScheme(
  schemesByPack: Record<string, TfgpFile>,
  key: string | null,
  scheme: TfgpFile,
): Record<string, TfgpFile> {
  if (!key) return schemesByPack;
  return { ...schemesByPack, [key]: structuredClone(scheme) };
}

export const useEditorStore = create<EditorState>()(
  persist(
    (set, get) => ({
      scheme: createEmptyTfgp('0.12.8', 1),
      activePackKey: null,
      schemesByPack: {},
      selectedNodeIds: [],
      selectedEdgeIds: [],
      flowEdgeData: {},
      flowResult: null,
      past: [],
      future: [],

      switchToPack: (modpackVersion, dataVersion) => {
        const { scheme, activePackKey, schemesByPack } = get();
        const updatedCache = cacheScheme(schemesByPack, activePackKey, scheme);
        const newKey = packKey(modpackVersion, dataVersion);
        const cached = updatedCache[newKey];
        const pack = usePackStore.getState().activePack;
        const nextScheme = cached
          ? { ...cached, nodes: normalizeSchemeNodes(cached.nodes, pack) }
          : createEmptyTfgp(modpackVersion, dataVersion);
        seedIdCounter(nextScheme.nodes, nextScheme.edges);

        set({
          schemesByPack: updatedCache,
          activePackKey: newKey,
          scheme: nextScheme,
          past: [],
          future: [],
          flowEdgeData: {},
          flowResult: null,
          selectedNodeIds: [],
          selectedEdgeIds: [],
        });
        get().updateFlows();
      },

      loadScheme: (file) => {
        const pack = usePackStore.getState().activePack;
        const nodes = dedupeNodeIds(normalizeSchemeNodes(file.nodes, pack), file.edges);
        const normalized = { ...file, nodes };
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
          flowEdgeData: {},
          flowResult: null,
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
        const recipe = pack?.recipes.find((r) => r.id === partial.recipeId);
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
              if ('recipeId' in patch && patch.recipeId && pack) {
                const recipe = pack.recipes.find((r) => r.id === patch.recipeId);
                next = { ...next, ...patchForRecipeChange(recipe, n) };
              } else if (
                ('voltageTier' in patch && patch.voltageTier) ||
                !('recipeId' in patch)
              ) {
                const recipe = pack?.recipes.find((r) => r.id === next.recipeId);
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
          usePackStore.getState().activePack?.recipes.find(
            (r) => r.id === params.recipeId,
          ),
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
        const pack = usePackStore.getState().activePack;
        if (!pack) return;
        const { scheme } = get();
        const snap = get().snapshot();
        const result = runSolver(snap, pack, { preserveManualMachineCounts: true });
        const flowEdgeData = buildFlowEdgeData(
          scheme,
          pack,
          result,
        );
        set({
          flowResult: result,
          flowEdgeData,
          schemesByPack: cacheScheme(
            get().schemesByPack,
            get().activePackKey,
            scheme,
          ),
        });
      },

      recalculateScheme: () => {
        const pack = usePackStore.getState().activePack;
        if (!pack) return;
        const { scheme } = get();
        const snap = get().snapshot();
        const result = runSolver(snap, pack, { preserveManualMachineCounts: false });
        const nodes = applyFlowResult(snap.nodes, result, 'full');
        const schemeWithNodes = { ...scheme, nodes };
        const flowEdgeData = buildFlowEdgeData(
          schemeWithNodes,
          pack,
          result,
        );
        set({
          scheme: schemeWithNodes,
          flowResult: result,
          flowEdgeData,
          schemesByPack: cacheScheme(
            get().schemesByPack,
            get().activePackKey,
            schemeWithNodes,
          ),
        });
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
    }),
    {
      name: 'tfg-editor-store',
      partialize: (s) => ({
        schemesByPack: s.schemesByPack,
        activePackKey: s.activePackKey,
      }),
      onRehydrateStorage: () => (state) => {
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
        queueMicrotask(() => {
          const pack = usePackStore.getState().activePack;
          if (pack) useEditorStore.getState().updateFlows();
        });
      },
    },
  ),
);
