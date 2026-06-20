import type { Node } from '@xyflow/react';
import type { MachineNodeData } from '@/canvas/MachineNode';
import type { PackData } from '@/data/types';
import { getMachineRecipeCount } from '@/data/pack-registry';

export const MACHINE_NODE_WIDTH = 220;
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
  pack: PackData,
  machineId: string,
  recipeId: string,
  surplusLineCount = 0,
): number {
  const recipeCount = getMachineRecipeCount(pack, machineId);
  const recipe = pack.recipes.find((r) => r.id === recipeId);

  let header = 28;
  if (recipeCount > 1) header += 32;
  header += 24;
  if (recipe?.energy) header += 16;
  header += surplusLineCount * 16;
  return header;
}

export function estimateHeaderHeightFromData(data: MachineNodeData): number {
  return estimateHeaderHeight(
    data.pack,
    data.machineId,
    data.recipeId,
    data.surplusLines?.length ?? 0,
  );
}

export function estimatePortsTopY(nodeY: number, data: MachineNodeData): number {
  return nodeY + estimateHeaderHeightFromData(data);
}

export function estimateMachineNodeHeightFromPorts(
  pack: PackData,
  machineId: string,
  recipeId: string,
  portCount: number,
  surplusLineCount = 0,
): number {
  const header = estimateHeaderHeight(pack, machineId, recipeId, surplusLineCount);
  return header + portCount * PORT_ROW_HEIGHT + PORT_SECTION_PADDING;
}

export function estimateMachineNodeHeight(data: MachineNodeData): number {
  const portCount = Math.max(data.inputPorts.length, data.outputPorts.length, 1);
  return estimateMachineNodeHeightFromPorts(
    data.pack,
    data.machineId,
    data.recipeId,
    portCount,
    data.surplusLines?.length ?? 0,
  );
}

/** Obstacle box from visible content — not bloated measured height from flex/minHeight. */
export function getMachineNodeRect(node: Node, padding = EDGE_ROUTE_PADDING): NodeRect {
  const data = node.data as MachineNodeData;
  const width = node.measured?.width ?? node.width ?? MACHINE_NODE_WIDTH;
  const height = estimateMachineNodeHeight(data);

  return {
    left: node.position.x - padding,
    top: node.position.y - padding,
    right: node.position.x + width + padding,
    bottom: node.position.y + height + padding,
  };
}
