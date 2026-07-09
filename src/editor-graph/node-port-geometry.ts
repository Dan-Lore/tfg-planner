import type { Node } from '@xyflow/react';
import {
  BUFFER_NODE_WIDTH,
  MACHINE_NODE_WIDTH,
  PORT_ROW_HEIGHT,
} from '@/editor-graph/node-layout-constants';
import {
  estimateBufferNodeHeightFromData,
  estimateHeaderHeight,
  estimateMachineNodeHeight,
} from '@/editor-graph/node-layout-estimates';
import { normalizePortId, parsePortId } from '@/shared/ports';

export interface MachinePortLayoutInput {
  pack: Parameters<typeof estimateHeaderHeight>[0];
  machineId: string;
  recipeId: string;
  layoutWidth?: number;
  measuredWidth?: number;
  inputPorts?: readonly unknown[];
  outputPorts?: readonly unknown[];
  balanceLines?: readonly unknown[];
}

export function estimateMachinePortCenterFromLayout(
  nodeX: number,
  nodeY: number,
  port: string,
  data: MachinePortLayoutInput,
): { x: number; y: number } {
  const parsed = parsePortId(normalizePortId(port));
  if (!parsed) return { x: nodeX, y: nodeY };
  const portsTopY =
    estimateHeaderHeight(data.pack, data.machineId, data.recipeId) + nodeY;
  const y = portsTopY + parsed.index * PORT_ROW_HEIGHT + PORT_ROW_HEIGHT / 2;
  const width = data.layoutWidth ?? data.measuredWidth ?? MACHINE_NODE_WIDTH;
  const x = parsed.kind === 'in' ? nodeX : nodeX + width;
  return { x, y };
}

export interface BufferPortLayoutInput {
  bufferKind: 'start_buffer' | 'end_buffer' | 'intermediate_buffer';
}

export function estimateBufferPortCenterFromLayout(
  nodeX: number,
  nodeY: number,
  port: string,
  data: BufferPortLayoutInput,
): { x: number; y: number } {
  const parsed = parsePortId(normalizePortId(port));
  if (!parsed) return { x: nodeX, y: nodeY };
  const header = 56;
  const fields = data.bufferKind === 'start_buffer' ? 88 : 36;
  const portsTopY = nodeY + header + fields;
  const y = portsTopY + parsed.index * PORT_ROW_HEIGHT + PORT_ROW_HEIGHT / 2;
  const x = parsed.kind === 'in' ? nodeX : nodeX + BUFFER_NODE_WIDTH;
  return { x, y };
}

export function estimatePortCenterFromRfNode(
  node: Node,
  port: string,
): { x: number; y: number } {
  if (node.type === 'buffer') {
    const data = node.data as unknown as BufferPortLayoutInput;
    return estimateBufferPortCenterFromLayout(node.position.x, node.position.y, port, {
      bufferKind: data.bufferKind,
    });
  }
  const data = node.data as unknown as MachinePortLayoutInput;
  return estimateMachinePortCenterFromLayout(node.position.x, node.position.y, port, {
    pack: data.pack,
    machineId: data.machineId,
    recipeId: data.recipeId,
    layoutWidth: data.layoutWidth,
    measuredWidth: node.measured?.width,
    inputPorts: data.inputPorts,
    outputPorts: data.outputPorts,
    balanceLines: data.balanceLines,
  });
}

export function estimateRfNodeHeight(node: Node): number {
  if (node.type === 'buffer') {
    return estimateBufferNodeHeightFromData(node.data as unknown as BufferPortLayoutInput);
  }
  return estimateMachineNodeHeight(node.data as unknown as MachinePortLayoutInput);
}
