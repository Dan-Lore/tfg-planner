import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { FlowResult } from '@/calculator';
import type { SchemeCheckResult } from '@/scheme-check/check-scheme';
import { readPersistedEditorSnapshot, type PersistedPackFlowCache } from '@/lib/editor-persist';
import { schemeFlowRevision } from '@/editor-graph/scheme-flow-revision';
import { restoreFlowsForScheme, getEditorBindings } from '@/stores/editor-store-shared';
import {
  flowPersistStorage,
  mergePersistedEditorState,
} from '@/stores/editor-combined-storage';
import {
  initFlowComputeRuntime,
  refreshSchemeCheckAsync,
  scheduleFlowUpdate,
} from '@/stores/flow-compute-runtime';

export type FlowComputeState = 'idle' | 'computing' | 'stale';

export interface FlowState {
  flowResult: FlowResult | null;
  schemeCheckResult: SchemeCheckResult | null;
  flowComputeState: FlowComputeState;
  flowsByPack: Record<string, PersistedPackFlowCache>;
  updateFlows: () => void;
  recalculateScheme: () => void;
  refreshSchemeCheck: () => void;
  refreshFlowDisplay: () => void;
  restoreForPack: (
    activePackKey: string | null,
    scheme: import('@/schema/tfgp').TfgpFile,
  ) => void;
  clearFlowState: () => void;
}

const persistedEditor = readPersistedEditorSnapshot();
const initialScheme =
  persistedEditor.scheme ??
  ({ modpack: { version: '0.12.8', dataVersion: 1 } } as import('@/schema/tfgp').TfgpFile);
const initialFlows = restoreFlowsForScheme(
  persistedEditor.flowsByPack,
  persistedEditor.activePackKey,
  initialScheme,
);

export const useFlowStore = create<FlowState>()(
  persist(
    (set, get) => ({
      flowResult: initialFlows.flowResult,
      schemeCheckResult: null,
      flowComputeState: initialFlows.flowComputeState,
      flowsByPack: persistedEditor.flowsByPack,

      restoreForPack: (activePackKey, scheme) => {
        const restored = restoreFlowsForScheme(get().flowsByPack, activePackKey, scheme);
        set({
          flowResult: restored.flowResult,
          flowComputeState: restored.flowComputeState,
          schemeCheckResult: null,
        });
      },

      clearFlowState: () => {
        set({
          flowResult: null,
          schemeCheckResult: null,
          flowComputeState: 'idle',
        });
      },

      updateFlows: () => {
        const { flowsByPack, flowResult, flowComputeState } = get();
        const schemeSlice = getEditorBindings()?.getScheme();
        if (!schemeSlice) return;
        const { scheme, activePackKey } = schemeSlice;
        if (flowComputeState === 'computing') {
          scheduleFlowUpdate('update');
          return;
        }
        const revision = schemeFlowRevision(scheme);
        const cached = activePackKey ? flowsByPack[activePackKey] : undefined;
        if (flowResult && flowComputeState === 'idle' && cached?.revision === revision) {
          void refreshSchemeCheckAsync();
          return;
        }
        scheduleFlowUpdate('update');
      },

      refreshSchemeCheck: () => {
        void refreshSchemeCheckAsync();
      },

      refreshFlowDisplay: () => {
        /* Edge labels derived in EditorPage from flowResult + scheme. */
      },

      recalculateScheme: () => {
        scheduleFlowUpdate('recalculate');
      },
    }),
    {
      name: 'tfg-editor-store',
      storage: flowPersistStorage,
      partialize: (s) => ({
        flowsByPack: s.flowsByPack,
      }),
      merge: (persisted, current) => {
        const merged = mergePersistedEditorState(persisted, {
          flowsByPack: current.flowsByPack,
        });
        return {
          ...current,
          flowsByPack: merged.flowsByPack ?? current.flowsByPack,
        };
      },
      onRehydrateStorage: () => () => {
        initFlowComputeRuntime();
      },
    },
  ),
);

/** Read flow slice without subscribing. */
export function getFlowStoreState(): FlowState {
  return useFlowStore.getState();
}
