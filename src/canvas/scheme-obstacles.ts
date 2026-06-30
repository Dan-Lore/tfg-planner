import type { PackLike } from '@/data/pack-registry';
import { getRecipe } from '@/data/pack-registry';
import type { NodeRect } from '@/canvas/node-bounds';
import {
  BUFFER_NODE_WIDTH,
  EDGE_ROUTE_PADDING,
  MACHINE_NODE_WIDTH,
  estimateBufferNodeHeight,
  estimateMachineNodeHeightFromPorts,
} from '@/canvas/node-bounds';
import type { NodeDynamicDisplay } from '@/canvas/node-display-context';
import { isBufferNode, isMachineNode } from '@/lib/node-kind';
import type { TfgpNode } from '@/schema/tfgp-types';

export interface SchemeObstacleEntry {
  nodeId: string;
  rect: NodeRect;
}

function machineRect(
  node: TfgpNode & { machineId: string; recipeId: string },
  pack: PackLike,
  layoutWidth: number | undefined,
  display: NodeDynamicDisplay | undefined,
  padding: number,
): NodeRect {
  const recipe = getRecipe(pack, node.recipeId);
  const inCount = display?.inputPorts.length ?? recipe?.inputs.length ?? 1;
  const outCount = display?.outputPorts.length ?? recipe?.outputs.length ?? 1;
  const portCount = Math.max(inCount, outCount, 1);
  const balanceCount = display?.balanceLines.length ?? 0;
  const width = layoutWidth ?? MACHINE_NODE_WIDTH;
  const height = estimateMachineNodeHeightFromPorts(
    pack,
    node.machineId,
    node.recipeId,
    portCount,
    balanceCount,
  );
  return {
    left: node.position.x - padding,
    top: node.position.y - padding,
    right: node.position.x + width + padding,
    bottom: node.position.y + height + padding,
  };
}

/** Obstacle boxes from scheme store positions — stable during drag (routing skipped while dragging). */
export function buildSchemeObstacleRects(
  nodes: TfgpNode[],
  pack: PackLike,
  layoutWidthByNodeId: Record<string, number>,
  displayById: Readonly<Record<string, NodeDynamicDisplay>>,
  padding = EDGE_ROUTE_PADDING,
): SchemeObstacleEntry[] {
  const out: SchemeObstacleEntry[] = [];
  for (const node of nodes) {
    if (isBufferNode(node)) {
      const height = estimateBufferNodeHeight(node.kind);
      out.push({
        nodeId: node.id,
        rect: {
          left: node.position.x - padding,
          top: node.position.y - padding,
          right: node.position.x + BUFFER_NODE_WIDTH + padding,
          bottom: node.position.y + height + padding,
        },
      });
      continue;
    }
    if (isMachineNode(node)) {
      out.push({
        nodeId: node.id,
        rect: machineRect(
          node,
          pack,
          layoutWidthByNodeId[node.id],
          displayById[node.id],
          padding,
        ),
      });
    }
  }
  return out;
}
