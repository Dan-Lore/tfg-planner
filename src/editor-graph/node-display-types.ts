import type { NodeBalanceLine, PortDisplay } from '@/editor-graph/port-display-types';

export interface NodeDynamicDisplay {
  inputPorts: PortDisplay[];
  outputPorts: PortDisplay[];
  balanceLines: NodeBalanceLine[];
  loadPercent?: number;
  loadLabel?: string;
  loadTitle?: string;
  bottleneckLabel?: string;
  bottleneckTitle?: string;
}
