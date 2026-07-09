import { idsEqual } from '@/lib/id-array-equal';

type SelectionGet = () => {
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
};
type SelectionSet = (partial: {
  selectedNodeIds?: string[];
  selectedEdgeIds?: string[];
}) => void;

export function createSchemeSelectionActions(get: SelectionGet, set: SelectionSet) {
  return {
    setSelectedNodeIds: (ids: string[]) => {
      const current = get().selectedNodeIds;
      if (idsEqual(current, ids)) return;
      set({ selectedNodeIds: ids });
    },

    setSelectedEdgeIds: (ids: string[]) => {
      const current = get().selectedEdgeIds;
      if (idsEqual(current, ids)) return;
      set({ selectedEdgeIds: ids });
    },
  };
}
