import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TfgpFile, TfgpMachineNode, TfgpNode, TfgpEdge, TfgpTarget, TfgpBufferKind, TfgpCustomMachineNode } from '@/schema/tfgp';
import { createEmptyTfgp } from '@/schema/tfgp';
import { packKey } from '@/lib/pack-key';
import { readPersistedEditorSnapshot } from '@/lib/editor-persist';
import {
  allocateEdgeId,
  allocateNodeId,
  dedupeSchemeTopology,
  normalizeSchemeNodes,
  seedIdCounter,
  type EditorSnapshot,
} from './editor-utils';
import { pruneInvalidEdges } from '@/lib/prune-edges';
import { normalizeNodeVoltage, patchForRecipeChange } from '@/lib/node-voltage';
import { defaultVoltageTierForRecipe } from '@/calculator/energy';
import { usePackStore } from './pack-store';
import { isBufferNode, isCustomMachineNode, isMachineNode } from '@/lib/node-kind';
import { estimateBufferDefaults, clampNonNegativeInt } from '@/lib/buffer-defaults';
import { normalizeBufferNode, normalizeCustomMachineNode } from '@/lib/node-scaling';
import {
  createEmptyCustomMachine,
  ensureCustomPortForHandle,
  portHasEdge,
} from '@/lib/custom-machine-ports';
import { inputPortId, outputPortId } from '@/lib/ports';
import { getRecipe } from '@/data/pack-registry';
import { cacheScheme } from '@/stores/editor-store-shared';
import {
  schemePersistStorage,
  mergePersistedEditorState,
} from '@/stores/editor-combined-storage';
import { getFlowStoreState } from '@/stores/flow-store';
import { refreshSchemeCheckAsync } from '@/stores/flow-compute-runtime';

const MAX_HISTORY = 50;

export interface SchemeState {
  scheme: TfgpFile;
  activePackKey: string | null;
  schemesByPack: Record<string, TfgpFile>;
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
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
  addCustomMachine: (position: { x: number; y: number }) => string;
  addCustomPort: (nodeId: string, side: 'in' | 'out') => void;
  removeCustomPort: (nodeId: string, side: 'in' | 'out', index: number) => void;
  ensureCustomPort: (
    nodeId: string,
    portId: string,
    product?: { itemId?: string; fluidId?: string },
  ) => void;
  attachCustomMachine: (params: {
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
  duplicateSelected: () => void;
  setSchemeName: (name: string) => void;
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

export const useSchemeStore = create<SchemeState>()(
  persist(
    (set, get) => ({
      scheme: initialScheme,
      activePackKey: persistedEditor.activePackKey,
      schemesByPack: persistedEditor.schemesByPack,
      selectedNodeIds: [],
      selectedEdgeIds: [],
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

        const flowStore = getFlowStoreState();
        flowStore.restoreForPack(newKey, nextScheme);

        set({
          schemesByPack: updatedCache,
          activePackKey: newKey,
          scheme: nextScheme,
          past: [],
          future: [],
          selectedNodeIds: [],
          selectedEdgeIds: [],
        });

        const { flowResult } = getFlowStoreState();
        if (!flowResult) {
          getFlowStoreState().updateFlows();
        } else {
          void refreshSchemeCheckAsync();
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
        getFlowStoreState().clearFlowState();
        set((s) => ({
          scheme: normalized,
          activePackKey: key,
          schemesByPack: cacheScheme(s.schemesByPack, key, normalized),
          past: [],
          future: [],
          selectedNodeIds: [],
          selectedEdgeIds: [],
        }));
        getFlowStoreState().updateFlows();
      },

      clearScheme: () => {
        const { scheme, activePackKey, schemesByPack } = get();
        const cleared = createEmptyTfgp(
          scheme.modpack.version,
          scheme.modpack.dataVersion,
        );
        seedIdCounter(cleared.nodes, cleared.edges);
        getFlowStoreState().clearFlowState();
        set({
          scheme: cleared,
          schemesByPack: cacheScheme(schemesByPack, activePackKey, cleared),
          past: [],
          future: [],
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
        getFlowStoreState().updateFlows();
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
        getFlowStoreState().updateFlows();
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
        getFlowStoreState().updateFlows();
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
              if (isCustomMachineNode(n)) {
                return normalizeCustomMachineNode({ ...n, ...patch } as typeof n);
              }
              if (!isMachineNode(n)) return n;
              let next: TfgpMachineNode = { ...n, ...(patch as Partial<TfgpMachineNode>) };
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
        getFlowStoreState().updateFlows();
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
        getFlowStoreState().updateFlows();
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
        getFlowStoreState().updateFlows();
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
        getFlowStoreState().updateFlows();
        return nodeId;
      },

      attachBuffer: (params) => {
        get().pushHistory();
        const { scheme } = get();
        const { flowResult } = getFlowStoreState();
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
        getFlowStoreState().updateFlows();
        return nodeId;
      },

      addCustomMachine: (position) => {
        get().pushHistory();
        const { scheme } = get();
        const id = allocateNodeId(scheme.nodes, scheme.edges);
        const node = normalizeCustomMachineNode(createEmptyCustomMachine(id, position));
        set((s) => {
          const scheme = { ...s.scheme, nodes: [...s.scheme.nodes, node] };
          return {
            scheme,
            schemesByPack: cacheScheme(s.schemesByPack, s.activePackKey, scheme),
          };
        });
        getFlowStoreState().updateFlows();
        return id;
      },

      addCustomPort: (nodeId, side) => {
        get().pushHistory();
        set((s) => {
          const scheme = {
            ...s.scheme,
            nodes: s.scheme.nodes.map((n) => {
              if (n.id !== nodeId || !isCustomMachineNode(n)) return n;
              const next =
                side === 'in'
                  ? { ...n, inputs: [...n.inputs, { amount: 1 }] }
                  : { ...n, outputs: [...n.outputs, { amount: 1 }] };
              return normalizeCustomMachineNode(next);
            }),
          };
          return {
            scheme,
            schemesByPack: cacheScheme(s.schemesByPack, s.activePackKey, scheme),
          };
        });
        getFlowStoreState().updateFlows();
      },

      removeCustomPort: (nodeId, side, index) => {
        const { scheme } = get();
        const node = scheme.nodes.find((n) => n.id === nodeId);
        if (!node || !isCustomMachineNode(node)) return;
        const portId = side === 'in' ? inputPortId(index) : outputPortId(index);
        if (portHasEdge(nodeId, portId, scheme.edges)) return;

        get().pushHistory();
        set((s) => {
          const scheme = {
            ...s.scheme,
            nodes: s.scheme.nodes.map((n) => {
              if (n.id !== nodeId || !isCustomMachineNode(n)) return n;
              const next =
                side === 'in'
                  ? { ...n, inputs: n.inputs.filter((_, i) => i !== index) }
                  : { ...n, outputs: n.outputs.filter((_, i) => i !== index) };
              return normalizeCustomMachineNode(next);
            }),
          };
          return {
            scheme,
            schemesByPack: cacheScheme(s.schemesByPack, s.activePackKey, scheme),
          };
        });
        getFlowStoreState().updateFlows();
      },

      ensureCustomPort: (nodeId, portId, product) => {
        set((s) => {
          const scheme = {
            ...s.scheme,
            nodes: s.scheme.nodes.map((n) => {
              if (n.id !== nodeId || !isCustomMachineNode(n)) return n;
              return normalizeCustomMachineNode(ensureCustomPortForHandle(n, portId, product));
            }),
          };
          return {
            scheme,
            schemesByPack: cacheScheme(s.schemesByPack, s.activePackKey, scheme),
          };
        });
      },

      attachCustomMachine: (params) => {
        get().pushHistory();
        const { scheme } = get();
        const nodeId = allocateNodeId(scheme.nodes, scheme.edges);
        const edgeId = allocateEdgeId(scheme.nodes, scheme.edges);
        const product = { itemId: params.itemId, fluidId: params.fluidId };
        const inPort = inputPortId(0);
        const outPort = outputPortId(0);

        let node: TfgpCustomMachineNode = normalizeCustomMachineNode(
          createEmptyCustomMachine(nodeId, params.position),
        );
        if (params.direction === 'downstream') {
          node = normalizeCustomMachineNode(
            ensureCustomPortForHandle(
              { ...node, inputs: [{ amount: 1, ...product }] },
              inPort,
              product,
            ),
          );
        } else {
          node = normalizeCustomMachineNode(
            ensureCustomPortForHandle(
              { ...node, outputs: [{ amount: 1, ...product }] },
              outPort,
              product,
            ),
          );
        }

        const edge: TfgpEdge =
          params.direction === 'downstream'
            ? {
                id: edgeId,
                source: params.anchorNodeId,
                sourcePort: params.anchorPort,
                target: nodeId,
                targetPort: inPort,
                itemId: params.itemId,
                fluidId: params.fluidId,
              }
            : {
                id: edgeId,
                source: nodeId,
                sourcePort: outPort,
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
        getFlowStoreState().updateFlows();
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
        getFlowStoreState().updateFlows();
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
        getFlowStoreState().recalculateScheme();
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
        getFlowStoreState().updateFlows();
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
      storage: schemePersistStorage,
      partialize: (s) => ({
        schemesByPack: s.schemesByPack,
        activePackKey: s.activePackKey,
      }),
      merge: (persisted, current) => {
        const merged = mergePersistedEditorState(persisted, {
          schemesByPack: current.schemesByPack,
          activePackKey: current.activePackKey,
        });
        return {
          ...current,
          schemesByPack: merged.schemesByPack ?? current.schemesByPack,
          activePackKey: merged.activePackKey ?? current.activePackKey,
        };
      },
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
        getFlowStoreState().restoreForPack(state.activePackKey, state.scheme);
        if (getFlowStoreState().flowResult) {
          queueMicrotask(() => {
            void refreshSchemeCheckAsync();
          });
        }
      },
    },
  ),
);

export function getSchemeStoreState(): SchemeState {
  return useSchemeStore.getState();
}
