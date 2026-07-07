import { createContext, useContext, useMemo, type ReactNode } from 'react';

type SelectionState = {
  nodeIds: ReadonlySet<string>;
  edgeIds: ReadonlySet<string>;
};

const emptySelection: SelectionState = {
  nodeIds: new Set(),
  edgeIds: new Set(),
};

const SelectionContext = createContext<SelectionState>(emptySelection);

export function SelectionProvider({
  selectedNodeIds,
  selectedEdgeIds,
  children,
}: {
  selectedNodeIds: readonly string[];
  selectedEdgeIds: readonly string[];
  children: ReactNode;
}) {
  const value = useMemo<SelectionState>(
    () => ({
      nodeIds: new Set(selectedNodeIds),
      edgeIds: new Set(selectedEdgeIds),
    }),
    [selectedNodeIds, selectedEdgeIds],
  );
  return (
    <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>
  );
}

export function useNodeSelected(nodeId: string): boolean {
  return useContext(SelectionContext).nodeIds.has(nodeId);
}

export function useEdgeSelected(edgeId: string): boolean {
  return useContext(SelectionContext).edgeIds.has(edgeId);
}
