import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TfgpFile, TfgpNode, TfgpEdge, TfgpTarget } from '@/schema/tfgp';
import { createEmptyTfgp } from '@/schema/tfgp';
import { packKey } from '@/lib/pack-key';
import {
  applyFlowResult,
  nextId,
  runSolver,
  type EditorSnapshot,
} from './editor-utils';
import type { FlowEdgeData } from '@/canvas/FlowEdge';
import {
  buildEdgeFlowData,
} from '@/canvas/flow-display';
import { pruneInvalidEdges } from '@/lib/prune-edges';
import type { FlowResult } from '@/calculator/flow-solver';
import { usePackStore } from './pack-store';

const MAX_HISTORY = 50;

interface EditorState {
  scheme: TfgpFile;
  activePackKey: string | null;
  schemesByPack: Record<string, TfgpFile>;
  selectedNodeIds: string[];
  flowEdgeData: Record<string, FlowEdgeData>;
  flowResult: FlowResult | null;
  past: EditorSnapshot[];
  future: EditorSnapshot[];
  switchToPack: (modpackVersion: string, dataVersion: number) => void;
  loadScheme: (file: TfgpFile) => void;
  snapshot: () => EditorSnapshot;
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  setNodes: (nodes: TfgpNode[]) => void;
  setEdges: (edges: TfgpEdge[]) => void;
  setViewport: (viewport: TfgpFile['viewport']) => void;
  addNode: (node: Omit<TfgpNode, 'id'>) => string;
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
  removeEdge: (id: string) => void;
  setSelectedNodeIds: (ids: string[]) => void;
  multiplySelectedOutputs: (factor: number) => void;
  setTarget: (target: TfgpTarget) => void;
  recalculate: () => void;
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
      flowEdgeData: {},
      flowResult: null,
      past: [],
      future: [],

      switchToPack: (modpackVersion, dataVersion) => {
        const { scheme, activePackKey, schemesByPack } = get();
        const updatedCache = cacheScheme(schemesByPack, activePackKey, scheme);
        const newKey = packKey(modpackVersion, dataVersion);
        const cached = updatedCache[newKey];

        set({
          schemesByPack: updatedCache,
          activePackKey: newKey,
          scheme: cached ?? createEmptyTfgp(modpackVersion, dataVersion),
          past: [],
          future: [],
          flowEdgeData: {},
          flowResult: null,
          selectedNodeIds: [],
        });
        get().recalculate();
      },

      loadScheme: (file) => {
        const key = packKey(file.modpack.version, file.modpack.dataVersion);
        set((s) => ({
          scheme: file,
          activePackKey: key,
          schemesByPack: cacheScheme(s.schemesByPack, key, file),
          past: [],
          future: [],
          selectedNodeIds: [],
        }));
        get().recalculate();
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
        get().recalculate();
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
        get().recalculate();
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
        const id = nextId('node');
        const node: TfgpNode = {
          ...partial,
          id,
          machineCount: partial.machineCount ?? 1,
          overclock: partial.overclock ?? 1,
          parallel: partial.parallel ?? 1,
          outputMultiplier: partial.outputMultiplier ?? 1,
        };
        set((s) => {
          const scheme = { ...s.scheme, nodes: [...s.scheme.nodes, node] };
          return {
            scheme,
            schemesByPack: cacheScheme(s.schemesByPack, s.activePackKey, scheme),
          };
        });
        get().recalculate();
        return id;
      },

      updateNode: (id, patch) => {
        get().pushHistory();
        set((s) => {
          let scheme = {
            ...s.scheme,
            nodes: s.scheme.nodes.map((n) =>
              n.id === id ? { ...n, ...patch } : n,
            ),
          };
          if (patch.recipeId) {
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
        get().recalculate();
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
          };
        });
        get().recalculate();
      },

      addEdge: (partial) => {
        get().pushHistory();
        const edge: TfgpEdge = { id: nextId('edge'), ...partial };
        set((s) => {
          const scheme = { ...s.scheme, edges: [...s.scheme.edges, edge] };
          return {
            scheme,
            schemesByPack: cacheScheme(s.schemesByPack, s.activePackKey, scheme),
          };
        });
        get().recalculate();
      },

      attachMachine: (params) => {
        get().pushHistory();
        const nodeId = nextId('node');
        const node: TfgpNode = {
          id: nodeId,
          machineId: params.machineId,
          recipeId: params.recipeId,
          position: params.position,
          machineCount: 1,
          overclock: 1,
          parallel: 1,
          outputMultiplier: 1,
        };
        const edge: TfgpEdge =
          params.direction === 'downstream'
            ? {
                id: nextId('edge'),
                source: params.anchorNodeId,
                sourcePort: params.anchorPort,
                target: nodeId,
                targetPort: params.newPort,
                itemId: params.itemId,
                fluidId: params.fluidId,
              }
            : {
                id: nextId('edge'),
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
        get().recalculate();
        return nodeId;
      },

      removeEdge: (id) => {
        get().pushHistory();
        set((s) => {
          const scheme = {
            ...s.scheme,
            edges: s.scheme.edges.filter((e) => e.id !== id),
          };
          return {
            scheme,
            schemesByPack: cacheScheme(s.schemesByPack, s.activePackKey, scheme),
          };
        });
        get().recalculate();
      },

      setSelectedNodeIds: (ids) => set({ selectedNodeIds: ids }),

      multiplySelectedOutputs: (factor) => {
        if (factor <= 0 || !Number.isFinite(factor)) return;
        get().pushHistory();
        const ids = new Set(get().selectedNodeIds);
        set((s) => {
          const scheme = {
            ...s.scheme,
            nodes: s.scheme.nodes.map((n) =>
              ids.has(n.id)
                ? { ...n, outputMultiplier: n.outputMultiplier * factor }
                : n,
            ),
          };
          return {
            scheme,
            schemesByPack: cacheScheme(s.schemesByPack, s.activePackKey, scheme),
          };
        });
        get().recalculate();
      },

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
        get().recalculate();
      },

      recalculate: () => {
        const pack = usePackStore.getState().activePack;
        if (!pack) return;
        const { scheme } = get();
        const snap = get().snapshot();
        const result = runSolver(snap, pack);
        const nodes = applyFlowResult(snap.nodes, result);
        const schemeWithNodes = { ...scheme, nodes };
        const flowEdgeData = buildEdgeFlowData(scheme.edges, result);
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
        const toCopy = get().scheme.nodes.filter((n) => idSet.has(n.id));
        const newNodes: TfgpNode[] = toCopy.map((n) => ({
          ...n,
          id: nextId('node'),
          position: { x: n.position.x + 40, y: n.position.y + 40 },
        }));
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
        get().recalculate();
      },
    }),
    {
      name: 'tfg-editor-store',
      partialize: (s) => ({
        schemesByPack: s.schemesByPack,
        activePackKey: s.activePackKey,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state?.activePackKey) return;
        const cached = state.schemesByPack[state.activePackKey];
        if (cached) state.scheme = cached;
      },
    },
  ),
);
