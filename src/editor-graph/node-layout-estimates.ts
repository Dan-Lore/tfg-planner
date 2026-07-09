import type { PackLike } from '@/data/pack-registry';
import { getMachineRecipeCount, getRecipe } from '@/data/pack-registry';
import type { TfgpBufferKind } from '@/schema/tfgp';
import {
  BUFFER_NODE_WIDTH,
  MACHINE_NODE_WIDTH,
  PORT_ROW_HEIGHT,
  PORT_SECTION_PADDING,
} from '@/editor-graph/node-layout-constants';

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

export interface MachineHeightInput {
  pack: PackLike;
  machineId: string;
  recipeId: string;
  inputPorts?: readonly unknown[];
  outputPorts?: readonly unknown[];
  balanceLines?: readonly unknown[];
}

export function estimateMachineNodeHeight(data: MachineHeightInput): number {
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

export function estimateBufferNodeHeightFromData(data: {
  bufferKind: TfgpBufferKind;
}): number {
  return estimateBufferNodeHeight(data.bufferKind);
}

export { MACHINE_NODE_WIDTH, BUFFER_NODE_WIDTH };
