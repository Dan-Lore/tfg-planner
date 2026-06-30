import type { Node } from '@xyflow/react';
import type { MachineNodeData } from '@/canvas/MachineNode';
import type { BufferNodeData } from '@/canvas/BufferNode';
import type { PackLike } from '@/data/pack-registry';
import { getMachineRecipeCount, getRecipe } from '@/data/pack-registry';
import type { TfgpBufferKind } from '@/schema/tfgp';

export const MACHINE_NODE_WIDTH = 220;
export const MACHINE_NODE_MIN_WIDTH = 200;
export const BUFFER_NODE_WIDTH = 200;

/** React Flow node.style — use instead of node.width with onlyRenderVisibleElements. */
export function machineNodeRfStyle(
  layoutWidth: number | undefined,
): { width: number; minWidth: number } | undefined {
  if (layoutWidth == null || layoutWidth <= 0) return undefined;
  return { width: layoutWidth, minWidth: layoutWidth };
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
/** Matches `.machine-port` min-height (1.35rem) + column gap (~0.2rem). */
export const PORT_ROW_HEIGHT = 24;
export const PORT_SECTION_PADDING = 6;
export const NODE_HEADER_MIN = 48;
export const EDGE_ROUTE_PADDING = 8;

export interface NodeRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function estimateHeaderHeight(
  pack: PackLike,
  machineId: string,
  recipeId: string,
  balanceLineCount = 0,
): number {
  const recipeCount = getMachineRecipeCount(pack, machineId);
  const recipe = getRecipe(pack, recipeId);

  let header = 28;
  if (recipeCount > 1) header += 32;
  header += 24;
  if (recipe?.energy) header += 16;
  header += balanceLineCount * 16;
  return header;
}

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

export function estimateMachineNodeHeightFromPorts(
  pack: PackLike,
  machineId: string,
  recipeId: string,
  portCount: number,
  balanceLineCount = 0,
): number {
  const header = estimateHeaderHeight(pack, machineId, recipeId, balanceLineCount);
  return header + portCount * PORT_ROW_HEIGHT + PORT_SECTION_PADDING;
}

export function estimateMachineNodeHeight(data: MachineNodeData): number {
  const portCount = Math.max(
    data.inputPorts?.length ?? 0,
    data.outputPorts?.length ?? 0,
    1,
  );
  return estimateMachineNodeHeightFromPorts(
    data.pack,
    data.machineId,
    data.recipeId,
    portCount,
    data.balanceLines?.length ?? 0,
  );
}

export function estimateBufferNodeHeight(bufferKind: TfgpBufferKind): number {
  const header = 56;
  const fields = bufferKind === 'start_buffer' ? 88 : 36;
  const portRows = 1;
  return header + fields + portRows * PORT_ROW_HEIGHT + PORT_SECTION_PADDING;
}

export function estimateBufferNodeHeightFromData(data: BufferNodeData): number {
  return estimateBufferNodeHeight(data.bufferKind);
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
