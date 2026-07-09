import type { Node } from '@xyflow/react';
import type { MachineNodeData } from '@/canvas/node-data-types';
import type { CustomMachineNodeData } from '@/canvas/node-data-types';
import type { BufferNodeData } from '@/canvas/node-data-types';

export {
  estimateHeaderHeight,
  estimateMachineNodeHeightFromPorts,
  estimateMachineNodeHeight,
  estimateBufferNodeHeight,
  estimateBufferNodeHeightFromData,
  type MachineHeightInput,
} from '@/editor-graph/node-layout-estimates';

export {
  MACHINE_NODE_WIDTH,
  MACHINE_NODE_MIN_WIDTH,
  CUSTOM_MACHINE_WIDTH_FACTOR,
  CUSTOM_MACHINE_NODE_MIN_WIDTH,
  CUSTOM_MACHINE_NODE_WIDTH,
  BUFFER_NODE_WIDTH,
  machineNodeRfStyle,
  PORT_ROW_HEIGHT,
  PORT_SECTION_PADDING,
  NODE_HEADER_MIN,
  EDGE_ROUTE_PADDING,
  type NodeRect,
} from '@/editor-graph/node-layout-constants';
import {
  MACHINE_NODE_WIDTH,
  MACHINE_NODE_MIN_WIDTH,
  BUFFER_NODE_WIDTH,
  CUSTOM_MACHINE_NODE_WIDTH,
  EDGE_ROUTE_PADDING,
  PORT_ROW_HEIGHT,
  PORT_SECTION_PADDING,
  type NodeRect,
} from '@/editor-graph/node-layout-constants';

/** Top-left position so a node of given size is centered on `center`. */
export function nodeTopLeftAtCenter(
  center: { x: number; y: number },
  width: number,
  height: number,
): { x: number; y: number } {
  return {
    x: center.x - width / 2,
    y: center.y - height / 2,
  };
}

/** Default card height for an empty custom machine (no ports yet). */
export function estimateEmptyCustomMachineNodeHeight(): number {
  const header = 76;
  const portCount = 1;
  return header + portCount * PORT_ROW_HEIGHT + PORT_SECTION_PADDING + 28;
}

/** Prefer computed layout width; ignore stale small React Flow measurements. */
export function resolveMachineCardWidth(
  layoutWidth: number | undefined,
  measuredWidth: number | undefined,
): number {
  if (typeof layoutWidth === 'number' && layoutWidth > 0) return layoutWidth;
  if (typeof measuredWidth === 'number' && measuredWidth >= MACHINE_NODE_MIN_WIDTH) {
    return measuredWidth;
  }
  return MACHINE_NODE_MIN_WIDTH;
}

import {
  estimateHeaderHeight,
  estimateMachineNodeHeight,
  estimateBufferNodeHeightFromData,
} from '@/editor-graph/node-layout-estimates';

export function estimateHeaderHeightFromData(data: MachineNodeData): number {
  return estimateHeaderHeight(
    data.pack,
    data.machineId,
    data.recipeId,
    data.balanceLines?.length ?? 0,
  );
}

export function estimatePortsTopY(nodeY: number, data: MachineNodeData): number {
  return nodeY + estimateHeaderHeightFromData(data);
}

export function estimateCustomMachineNodeHeight(data: CustomMachineNodeData): number {
  const header = 76 + (data.balanceLines?.length ?? 0) * 16;
  const portCount = Math.max(
    data.inputPorts?.length ?? 0,
    data.outputPorts?.length ?? 0,
    1,
  );
  return header + portCount * PORT_ROW_HEIGHT + PORT_SECTION_PADDING + 28;
}

export function getCustomMachineNodeRect(node: Node, padding = EDGE_ROUTE_PADDING): NodeRect {
  const data = node.data as CustomMachineNodeData;
  const width =
    data.layoutWidth ?? node.measured?.width ?? node.width ?? CUSTOM_MACHINE_NODE_WIDTH;
  const height = estimateCustomMachineNodeHeight(data);
  return {
    left: node.position.x - padding,
    top: node.position.y - padding,
    right: node.position.x + width + padding,
    bottom: node.position.y + height + padding,
  };
}

export function getBufferNodeRect(node: Node, padding = EDGE_ROUTE_PADDING): NodeRect {
  const data = node.data as BufferNodeData;
  const width = BUFFER_NODE_WIDTH;
  const height = estimateBufferNodeHeightFromData(data);
  return {
    left: node.position.x - padding,
    top: node.position.y - padding,
    right: node.position.x + width + padding,
    bottom: node.position.y + height + padding,
  };
}

/** Rect for edge-routing obstacles (machine or buffer nodes). */
export function getFlowNodeRect(node: Node, padding = EDGE_ROUTE_PADDING): NodeRect {
  if (node.type === 'buffer') return getBufferNodeRect(node, padding);
  if (node.type === 'customMachine') return getCustomMachineNodeRect(node, padding);
  return getMachineNodeRect(node, padding);
}

/** Obstacle box from visible content — not bloated measured height from flex/minHeight. */
export function getMachineNodeRect(node: Node, padding = EDGE_ROUTE_PADDING): NodeRect {
  const data = node.data as MachineNodeData;
  const width =
    data.layoutWidth ?? node.measured?.width ?? node.width ?? MACHINE_NODE_WIDTH;
  const height = estimateMachineNodeHeight(data);

  return {
    left: node.position.x - padding,
    top: node.position.y - padding,
    right: node.position.x + width + padding,
    bottom: node.position.y + height + padding,
  };
}
