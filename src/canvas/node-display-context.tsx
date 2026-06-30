import { createContext, useContext, type ReactNode } from 'react';
import type { NodeBalanceLine } from '@/canvas/flow-display';
import type { PortDisplay } from '@/canvas/MachineNode';

export interface NodeDynamicDisplay {
  inputPorts: PortDisplay[];
  outputPorts: PortDisplay[];
  balanceLines: NodeBalanceLine[];
  loadPercent?: number;
  loadLabel?: string;
  loadTitle?: string;
}

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
