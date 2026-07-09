import fs from 'node:fs';
import path from 'node:path';
import { Position, type Node } from '@xyflow/react';
import {
  BUFFER_NODE_WIDTH,
  EDGE_ROUTE_PADDING,
  MACHINE_NODE_WIDTH,
  type NodeRect,
} from '@/editor-graph/node-layout-constants';
import {
  estimateBufferNodeHeight,
  estimateBufferNodeHeightFromData,
  estimateMachineNodeHeight,
  estimateMachineNodeHeightFromPorts,
} from '@/editor-graph/node-layout-estimates';
import {
  estimateBufferPortCenterFromLayout,
  estimateMachinePortCenterFromLayout,
  type BufferPortLayoutInput,
  type MachinePortLayoutInput,
} from '@/editor-graph/node-port-geometry';
import { buildEdgeRoutePlan, applyParallelOffset } from '@/editor-graph/edge-route-plan';
import {
  bezierHitsThirdPartyObstacles,
  buildSmoothStepRoute,
  getRoutedSmoothStepPath,
  pathCrossesNodeBody,
  pathHitsThirdPartyObstacles,
  type EdgeRouteEndpoints,
  type RoutingObstacle,
} from '@/editor-graph/edge-routing';
import { minCorridorSeparation } from '@/editor-graph/edge-route-lanes';
import { loadTestPack } from '@/test-fixtures/load-test-pack';
import type { TfgpBufferKind } from '@/schema/tfgp';

const pack = loadTestPack('0.12.8');

type HarnessBufferNodeData = BufferPortLayoutInput & {
  itemId?: string;
  fluidId?: string;
  capacity: number;
  pack: typeof pack;
  inputPorts: Array<{ portId: string; label: string; connected: boolean }>;
  outputPorts: Array<{ portId: string; label: string; connected: boolean }>;
};

export function getMachineNodeRect(
  node: Node,
  padding = EDGE_ROUTE_PADDING,
): NodeRect {
  const data = node.data as unknown as MachinePortLayoutInput;
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

function getBufferNodeRect(node: Node, padding = EDGE_ROUTE_PADDING): NodeRect {
  const data = node.data as unknown as HarnessBufferNodeData;
  const width = BUFFER_NODE_WIDTH;
  const height = estimateBufferNodeHeightFromData(data);
  return {
    left: node.position.x - padding,
    top: node.position.y - padding,
    right: node.position.x + width + padding,
    bottom: node.position.y + height + padding,
  };
}

function getFlowNodeRect(node: Node, padding = EDGE_ROUTE_PADDING): NodeRect {
  if (node.type === 'buffer') return getBufferNodeRect(node, padding);
  return getMachineNodeRect(node, padding);
}

export type FixtureMachineNode = {
  id: string;
  machineId: string;
  recipeId: string;
  position: { x: number; y: number };
};

export type FixtureBufferNode = {
  id: string;
  position: { x: number; y: number };
  kind: TfgpBufferKind;
  itemId?: string;
  fluidId?: string;
};

export type FixtureEdge = {
  id: string;
  source: string;
  target: string;
  sourcePort: string;
  targetPort: string;
};

export type FixtureGraph = {
  nodes: Array<FixtureMachineNode | FixtureBufferNode>;
  edges: FixtureEdge[];
};

export function loadFixtureGraph(relativePath: string): FixtureGraph {
  const filePath = path.join(process.cwd(), relativePath);
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as FixtureGraph;
}

function isBufferNode(
  n: FixtureMachineNode | FixtureBufferNode,
): n is FixtureBufferNode {
  return 'kind' in n;
}

export function makeMachineNode(
  id: string,
  machineId: string,
  recipeId: string,
  pos: { x: number; y: number },
): Node {
  const recipe = pack.recipes.find((r) => r.id === recipeId)!;
  const portCount = Math.max(recipe.inputs.length, recipe.outputs.length, 1);
  const height = estimateMachineNodeHeightFromPorts(
    pack,
    machineId,
    recipeId,
    portCount,
  );
  return {
    id,
    type: 'machine',
    position: pos,
    data: {
      machineId,
      recipeId,
      pack,
      inputPorts: recipe.inputs.map((_, i) => ({
        portId: `in_${i}`,
        label: '',
        connected: true,
      })),
      outputPorts: recipe.outputs.map((_, i) => ({
        portId: `out_${i}`,
        label: '',
        connected: true,
      })),
      balanceLines: [],
      machineCount: 1,
      overclock: 1,
      voltageTier: 'LV',
      onRecipeChange: () => {},
      onMachineCountChange: () => {},
      onOverclockChange: () => {},
      onPortContextMenu: () => {},
    },
    measured: { width: MACHINE_NODE_WIDTH, height },
  };
}

export function makeBufferNode(
  id: string,
  kind: TfgpBufferKind,
  pos: { x: number; y: number },
  itemId?: string,
  fluidId?: string,
  measuredHeight?: number,
): Node {
  const height = measuredHeight ?? estimateBufferNodeHeight(kind);
  const data: HarnessBufferNodeData = {
    bufferKind: kind,
    itemId,
    fluidId,
    capacity: 0,
    pack,
    inputPorts: [{ portId: 'in_0', label: '', connected: true }],
    outputPorts: [{ portId: 'out_0', label: '', connected: true }],
  };
  return {
    id,
    type: 'buffer',
    position: pos,
    data: data as unknown as Record<string, unknown>,
    measured: { width: BUFFER_NODE_WIDTH, height },
  };
}

function estimatePortCenter(
  node: FixtureMachineNode | FixtureBufferNode,
  port: string,
): { x: number; y: number } {
  return isBufferNode(node)
    ? estimateBufferPortCenterFromLayout(
        node.position.x,
        node.position.y,
        port,
        { bufferKind: node.kind },
      )
    : estimateMachinePortCenterFromLayout(
        node.position.x,
        node.position.y,
        port,
        {
          pack,
          machineId: node.machineId,
          recipeId: node.recipeId,
        },
      );
}

export function buildFixtureGraph(
  graph: FixtureGraph,
  cardHeights?: Readonly<Record<string, number>>,
) {
  const nodes = new Map<string, Node>();
  for (const n of graph.nodes) {
    if (isBufferNode(n)) {
      nodes.set(
        n.id,
        makeBufferNode(
          n.id,
          n.kind,
          n.position,
          n.itemId,
          n.fluidId,
          cardHeights?.[n.id],
        ),
      );
    } else {
      const node = makeMachineNode(n.id, n.machineId, n.recipeId, n.position);
      const measuredHeight = cardHeights?.[n.id];
      if (measuredHeight != null) {
        nodes.set(n.id, {
          ...node,
          measured: { width: node.measured!.width!, height: measuredHeight },
        });
      } else {
        nodes.set(n.id, node);
      }
    }
  }
  const obstacles: RoutingObstacle[] = [...nodes.values()].map((node) => ({
    nodeId: node.id,
    rect: getFlowNodeRect(node),
  }));
  return { nodes, obstacles, nodeByFixtureId: graph.nodes };
}

export function horizontalLaneY(
  waypoints: { x: number; y: number }[],
): number | undefined {
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i]!;
    const b = waypoints[i + 1]!;
    if (Math.abs(a.y - b.y) < 0.5 && Math.abs(a.x - b.x) > 40) return a.y;
  }
  return undefined;
}

export function laneRunsThroughGap(
  laneY: number,
  upperBottom: number,
  lowerTop: number,
): boolean {
  return laneY > upperBottom && laneY < lowerTop;
}

export function simulateGraphEdges(
  graph: FixtureGraph,
  cardHeights?: Readonly<Record<string, number>>,
) {
  const { obstacles, nodeByFixtureId } = buildFixtureGraph(graph, cardHeights);
  const fixtureNodeById = new Map(nodeByFixtureId.map((n) => [n.id, n]));

  const planInputs = graph.edges.map((edge) => {
    const sourceFixture = fixtureNodeById.get(edge.source)!;
    const targetFixture = fixtureNodeById.get(edge.target)!;
    const src = estimatePortCenter(sourceFixture, edge.sourcePort);
    const tgt = estimatePortCenter(targetFixture, edge.targetPort);
    const endpoints: EdgeRouteEndpoints = {
      sourceX: src.x,
      sourceY: src.y,
      targetX: tgt.x,
      targetY: tgt.y,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
    return {
      edgeId: edge.id,
      endpoints,
      routing: { sourceId: edge.source, targetId: edge.target },
    };
  });

  const plan = buildEdgeRoutePlan(planInputs, obstacles);

  return graph.edges.map((edge) => {
    const entry = plan.get(edge.id)!;
    const input = planInputs.find((i) => i.edgeId === edge.id)!;
    const thirdPartyHits = entry.needsRouting
      ? pathHitsThirdPartyObstacles(
          input.endpoints,
          entry.laneCenter,
          obstacles,
          20,
          input.routing,
        )
      : bezierHitsThirdPartyObstacles(
          input.endpoints,
          obstacles,
          input.routing,
        )
        ? 1
        : 0;

    return {
      edgeId: edge.id,
      source: edge.source,
      target: edge.target,
      endpoints: input.endpoints,
      needs: entry.needsRouting,
      laneCenter: entry.laneCenter,
      laneY: entry.needsRouting ? horizontalLaneY(entry.waypoints) : undefined,
      waypoints: entry.waypoints,
      thirdPartyHits,
    };
  });
}

export function sharedCorridorPairs(edges: ReturnType<typeof simulateGraphEdges>) {
  const routed = edges.filter((e) => e.needs && e.waypoints.length > 0);
  const pairs: Array<[typeof routed[0], typeof routed[0]]> = [];
  for (let i = 0; i < routed.length; i++) {
    for (let j = i + 1; j < routed.length; j++) {
      const sep = minCorridorSeparation(routed[i]!.waypoints, routed[j]!.waypoints);
      if (Number.isFinite(sep)) pairs.push([routed[i]!, routed[j]!]);
    }
  }
  return pairs;
}

/** Mirrors FlowEdge: live route center + optional batch parallel offset. */
export function simulateFlowEdgePath(
  graph: FixtureGraph,
  edgeId: string,
  cardHeights?: Readonly<Record<string, number>>,
) {
  const { obstacles } = buildFixtureGraph(graph, cardHeights);
  const simulated = simulateGraphEdges(graph, cardHeights);
  const edge = simulated.find((e) => e.edgeId === edgeId)!;
  const routing = { sourceId: edge.source, targetId: edge.target };

  const planInputs = graph.edges.map((e) => {
    const s = simulated.find((x) => x.edgeId === e.id)!;
    return {
      edgeId: e.id,
      endpoints: s.endpoints,
      routing: { sourceId: e.source, targetId: e.target },
    };
  });
  const plan = buildEdgeRoutePlan(planInputs, obstacles);
  const entry = plan.get(edgeId)!;

  const live = getRoutedSmoothStepPath(edge.endpoints, obstacles, routing);
  let center = live.center;
  if (
    entry.parallelOffset &&
    (entry.parallelOffset.centerX !== undefined ||
      entry.parallelOffset.centerY !== undefined)
  ) {
    const shifted = applyParallelOffset(live.center, entry.parallelOffset);
    const routeHits = (candidate: typeof live.center) =>
      pathHitsThirdPartyObstacles(
        edge.endpoints,
        candidate,
        obstacles,
        20,
        routing,
      ) +
      pathCrossesNodeBody(
        edge.endpoints,
        candidate,
        edge.source,
        obstacles,
        20,
        routing,
      ) +
      pathCrossesNodeBody(
        edge.endpoints,
        candidate,
        edge.target,
        obstacles,
        20,
        routing,
      );
    if (routeHits(shifted) <= routeHits(live.center)) {
      center = shifted;
    }
  }

  const { waypoints } = buildSmoothStepRoute(edge.endpoints, center);
  return {
    edge,
    routing,
    obstacles,
    finalCenter: center,
    waypoints,
    sourceBodyHits: pathCrossesNodeBody(
      edge.endpoints,
      center,
      edge.source,
      obstacles,
      20,
      routing,
    ),
    targetBodyHits: pathCrossesNodeBody(
      edge.endpoints,
      center,
      edge.target,
      obstacles,
      20,
      routing,
    ),
    thirdPartyHits: pathHitsThirdPartyObstacles(
      edge.endpoints,
      center,
      obstacles,
      20,
      routing,
    ),
  };
}
