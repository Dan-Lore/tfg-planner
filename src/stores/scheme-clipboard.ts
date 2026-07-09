import {
  cloneSchemeFragment,
  pasteSchemeFragment,
  snapshotSchemeFragment,
  type SchemeClipboard,
} from './editor-utils';
import { getFlowStoreState } from '@/stores/flow-store';
import { patchSchemeCache } from './scheme-store-helpers';
import type { SchemeCacheSlice } from './scheme-store-helpers';

let schemeClipboard: SchemeClipboard | null = null;

type ClipboardGet = () =>
  SchemeCacheSlice & {
    selectedNodeIds: string[];
  };
type ClipboardSet = (
  partial:
    | Partial<SchemeCacheSlice & { selectedNodeIds: string[] }>
    | ((
        s: SchemeCacheSlice & { selectedNodeIds: string[] },
      ) => Partial<SchemeCacheSlice & { selectedNodeIds: string[] }>),
) => void;

export function createSchemeClipboardActions(
  get: ClipboardGet,
  set: ClipboardSet,
  pushHistory: () => void,
) {
  return {
    duplicateSelected: () => {
      const ids = get().selectedNodeIds;
      if (ids.length === 0) return;
      pushHistory();
      const { scheme } = get();
      const { nodes: newNodes, edges: newEdges, newNodeIds } = cloneSchemeFragment(
        scheme.nodes,
        scheme.edges,
        ids,
      );
      if (newNodes.length === 0) return;
      set((s) => {
        const nextScheme = {
          ...s.scheme,
          nodes: [...s.scheme.nodes, ...newNodes],
          edges: [...s.scheme.edges, ...newEdges],
        };
        return {
          ...patchSchemeCache(s, nextScheme),
          selectedNodeIds: newNodeIds,
        };
      });
      getFlowStoreState().updateFlows();
    },

    copySelection: () => {
      const { scheme, selectedNodeIds } = get();
      schemeClipboard = snapshotSchemeFragment(
        scheme.nodes,
        scheme.edges,
        selectedNodeIds,
      );
    },

    pasteClipboard: () => {
      if (!schemeClipboard || schemeClipboard.nodes.length === 0) return;
      pushHistory();
      const { scheme } = get();
      const { nodes: newNodes, edges: newEdges, newNodeIds } = pasteSchemeFragment(
        scheme.nodes,
        scheme.edges,
        schemeClipboard,
      );
      set((s) => {
        const nextScheme = {
          ...s.scheme,
          nodes: [...s.scheme.nodes, ...newNodes],
          edges: [...s.scheme.edges, ...newEdges],
        };
        return {
          ...patchSchemeCache(s, nextScheme),
          selectedNodeIds: newNodeIds,
        };
      });
      getFlowStoreState().updateFlows();
    },
  };
}

/** Test-only: reset module clipboard between tests. */
export function resetSchemeClipboardForTests(): void {
  schemeClipboard = null;
}
