import { createContext, useContext, type ReactNode } from 'react';
export type { NodeDynamicDisplay } from '@/editor-graph/node-display-types';
import type { NodeDynamicDisplay } from '@/editor-graph/node-display-types';

const EMPTY_DISPLAY: NodeDynamicDisplay = {
  inputPorts: [],
  outputPorts: [],
  balanceLines: [],
};

const NodeDisplayContext = createContext<Readonly<Record<string, NodeDynamicDisplay>>>(
  {},
);

export function NodeDisplayProvider({
  value,
  children,
}: {
  value: Readonly<Record<string, NodeDynamicDisplay>>;
  children: ReactNode;
}) {
  return (
    <NodeDisplayContext.Provider value={value}>{children}</NodeDisplayContext.Provider>
  );
}

export function useNodeDisplay(nodeId: string): NodeDynamicDisplay {
  return useContext(NodeDisplayContext)[nodeId] ?? EMPTY_DISPLAY;
}
