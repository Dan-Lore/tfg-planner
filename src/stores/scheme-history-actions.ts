import { cacheScheme } from '@/stores/editor-store-shared';
import { getFlowStoreState } from '@/stores/flow-store';
import { MAX_SCHEME_HISTORY, trimHistoryPast } from '@/stores/scheme-history';
import type { EditorSnapshot } from './editor-utils';
import type { SchemeCacheSlice } from './scheme-store-helpers';

export interface SchemeHistorySlice extends SchemeCacheSlice {
  past: EditorSnapshot[];
  future: EditorSnapshot[];
}

type HistoryGet = () => SchemeHistorySlice & {
  snapshot: () => EditorSnapshot;
};
type HistorySet = (
  partial:
    | Partial<SchemeHistorySlice>
    | ((s: SchemeHistorySlice) => Partial<SchemeHistorySlice>),
) => void;

export function createSchemeSnapshot(
  scheme: SchemeHistorySlice['scheme'],
): EditorSnapshot {
  return {
    nodes: structuredClone(scheme.nodes),
    edges: structuredClone(scheme.edges),
    edgeConstraints: structuredClone(scheme.edgeConstraints ?? []),
    viewport: { ...scheme.viewport },
  };
}

export function createSchemeHistoryActions(get: HistoryGet, set: HistorySet) {
  return {
    snapshot: () => createSchemeSnapshot(get().scheme),

    pushHistory: () => {
      const snap = get().snapshot();
      set((s) => ({
        past: [...trimHistoryPast(s.past, MAX_SCHEME_HISTORY), snap],
        future: [],
      }));
    },

    undo: () => {
      const { past, future } = get();
      if (past.length === 0) return;
      const prev = past[past.length - 1]!;
      const current = get().snapshot();
      set((s) => ({
        scheme: {
          ...s.scheme,
          nodes: prev.nodes,
          edges: prev.edges,
          edgeConstraints: prev.edgeConstraints,
          viewport: prev.viewport,
        },
        schemesByPack: cacheScheme(s.schemesByPack, s.activePackKey, {
          ...s.scheme,
          nodes: prev.nodes,
          edges: prev.edges,
          edgeConstraints: prev.edgeConstraints,
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
      const next = future[0]!;
      const current = get().snapshot();
      set((s) => ({
        scheme: {
          ...s.scheme,
          nodes: next.nodes,
          edges: next.edges,
          edgeConstraints: next.edgeConstraints,
          viewport: next.viewport,
        },
        schemesByPack: cacheScheme(s.schemesByPack, s.activePackKey, {
          ...s.scheme,
          nodes: next.nodes,
          edges: next.edges,
          edgeConstraints: next.edgeConstraints,
          viewport: next.viewport,
        }),
        past: [...past, current],
        future: future.slice(1),
      }));
      getFlowStoreState().updateFlows();
    },
  };
}
