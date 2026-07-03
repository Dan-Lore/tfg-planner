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

/** Reject only bloated measurements (e.g. RF wrapper), not taller real cards like start buffers. */
const MEASURED_HEIGHT_MAX_RATIO = 2.5;

function resolveObstacleCardHeight(estimated: number, measured: number | undefined): number {
  if (measured == null || measured <= 0) return estimated;
  if (measured > estimated * MEASURED_HEIGHT_MAX_RATIO) return estimated;
  return measured;
}

function machineRect(
  node: TfgpNode & { machineId: string; recipeId: string },
  pack: PackLike,
  layoutWidth: number | undefined,
  display: NodeDynamicDisplay | undefined,
  padding: number,
  cardHeightsByNodeId?: Readonly<Record<string, number>>,
): NodeRect {
  const recipe = getRecipe(pack, node.recipeId);
  const inCount = display?.inputPorts.length ?? recipe?.inputs.length ?? 1;
  const outCount = display?.outputPorts.length ?? recipe?.outputs.length ?? 1;
  const portCount = Math.max(inCount, outCount, 1);
  const balanceCount = display?.balanceLines.length ?? 0;
  const width = layoutWidth ?? MACHINE_NODE_WIDTH;
  const estimated = estimateMachineNodeHeightFromPorts(
    pack,
    node.machineId,
    node.recipeId,
    portCount,
    balanceCount,
  );
  const height = resolveObstacleCardHeight(estimated, cardHeightsByNodeId?.[node.id]);
  return {
    left: node.position.x - padding,
    top: node.position.y - padding,
    right: node.position.x + width + padding,
    bottom: node.position.y + height + padding,
  };
}

/** Obstacle boxes from scheme store positions. */
export function buildSchemeObstacleRects(
  nodes: TfgpNode[],
  pack: PackLike,
  layoutWidthByNodeId: Record<string, number>,
  displayById: Readonly<Record<string, NodeDynamicDisplay>>,
  cardHeightsByNodeId?: Readonly<Record<string, number>>,
  padding = EDGE_ROUTE_PADDING,
): SchemeObstacleEntry[] {
  const out: SchemeObstacleEntry[] = [];
  for (const node of nodes) {
    if (isBufferNode(node)) {
      const estimated = estimateBufferNodeHeight(node.kind);
      const height = resolveObstacleCardHeight(estimated, cardHeightsByNodeId?.[node.id]);
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
          cardHeightsByNodeId,
        ),
      });
    }
  }
  return out;
}

type NodePosition = { id: string; position: { x: number; y: number } };

/** Shift obstacle rects for nodes being dragged to match live canvas positions. */
export function shiftObstaclesForDragging(
  obstacles: SchemeObstacleEntry[],
  liveNodes: readonly NodePosition[],
  storeNodes: readonly NodePosition[],
  draggingNodeIds: ReadonlySet<string>,
): SchemeObstacleEntry[] {
  if (draggingNodeIds.size === 0) return obstacles;
  const liveById = new Map(liveNodes.map((n) => [n.id, n.position]));
  const storeById = new Map(storeNodes.map((n) => [n.id, n.position]));
  let changed = false;
  const next = obstacles.map((entry) => {
    if (!draggingNodeIds.has(entry.nodeId)) return entry;
    const live = liveById.get(entry.nodeId);
    const store = storeById.get(entry.nodeId);
    if (!live || !store) return entry;
    const dx = live.x - store.x;
    const dy = live.y - store.y;
    if (dx === 0 && dy === 0) return entry;
    changed = true;
    return {
      nodeId: entry.nodeId,
      rect: {
        left: entry.rect.left + dx,
        top: entry.rect.top + dy,
        right: entry.rect.right + dx,
        bottom: entry.rect.bottom + dy,
      },
    };
  });
  return changed ? next : obstacles;
}
