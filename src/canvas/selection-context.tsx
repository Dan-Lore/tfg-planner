import { createContext, useContext, useMemo, type ReactNode } from 'react';

const SelectionContext = createContext<ReadonlySet<string>>(new Set());

export function SelectionProvider({
  selectedNodeIds,
  children,
}: {
  selectedNodeIds: readonly string[];
  children: ReactNode;
}) {
  const selectedSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);
  return (
    <SelectionContext.Provider value={selectedSet}>{children}</SelectionContext.Provider>
  );
}

export function useNodeSelected(nodeId: string): boolean {
  return useContext(SelectionContext).has(nodeId);
}
