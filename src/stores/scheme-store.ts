import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TfgpFile, TfgpMachineNode, TfgpNode, TfgpEdge, TfgpEdgeConstraint, TfgpBufferKind } from '@/schema/tfgp';
import { createEmptyTfgp } from '@/schema/tfgp';
import { readPersistedEditorSnapshot } from '@/lib/editor-persist';
import { normalizeSchemeNodes, seedIdCounter, type EditorSnapshot } from './editor-utils';
import {
  schemePersistStorage,
  mergePersistedEditorState,
} from '@/stores/editor-combined-storage';
import { getFlowStoreState } from '@/stores/flow-store';
import { refreshSchemeCheckAsync } from '@/stores/flow-compute-runtime';
import { createSchemeHistoryActions } from './scheme-history-actions';
import { createSchemeLifecycleActions } from './scheme-lifecycle';
import { createSchemeMutations } from './scheme-mutations';
import { createSchemeAttachMutations } from './scheme-attach-mutations';
import { createSchemeClipboardActions } from './scheme-clipboard';
import { createSchemeSelectionActions } from './scheme-selection';
import { createSchemeEdgeConstraintActions } from './scheme-edge-constraints';

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
  setEdgeConstraint: (constraint: TfgpEdgeConstraint) => void;
  clearEdgeConstraint: (edgeId: string) => void;
  duplicateSelected: () => void;
  copySelection: () => void;
  pasteClipboard: () => void;
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
    (set, get) => {
      const history = createSchemeHistoryActions(
        get as Parameters<typeof createSchemeHistoryActions>[0],
        set as Parameters<typeof createSchemeHistoryActions>[1],
      );
      const lifecycle = createSchemeLifecycleActions(
        get as Parameters<typeof createSchemeLifecycleActions>[0],
        set as Parameters<typeof createSchemeLifecycleActions>[1],
      );
      const mutations = createSchemeMutations(
        get as Parameters<typeof createSchemeMutations>[0],
        set as Parameters<typeof createSchemeMutations>[1],
      );
      const attachMutations = createSchemeAttachMutations(
        get as Parameters<typeof createSchemeAttachMutations>[0],
        set as Parameters<typeof createSchemeAttachMutations>[1],
      );
      const selection = createSchemeSelectionActions(get, set);
      const clipboard = createSchemeClipboardActions(
        get as Parameters<typeof createSchemeClipboardActions>[0],
        set as Parameters<typeof createSchemeClipboardActions>[1],
        history.pushHistory,
      );
      const edgeConstraints = createSchemeEdgeConstraintActions(
        get as Parameters<typeof createSchemeEdgeConstraintActions>[0],
        set as Parameters<typeof createSchemeEdgeConstraintActions>[1],
        history.pushHistory,
      );

      return {
        scheme: initialScheme,
        activePackKey: persistedEditor.activePackKey,
        schemesByPack: persistedEditor.schemesByPack,
        selectedNodeIds: [],
        selectedEdgeIds: [],
        past: [],
        future: [],
        ...history,
        ...lifecycle,
        ...mutations,
        ...attachMutations,
        ...selection,
        ...clipboard,
        ...edgeConstraints,
      };
    },
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
