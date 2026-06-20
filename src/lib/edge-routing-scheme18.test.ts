import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Position, type Node } from '@xyflow/react';
import type { MachineNodeData } from '@/canvas/MachineNode';
import {
  MACHINE_NODE_WIDTH,
  PORT_ROW_HEIGHT,
  estimateHeaderHeight,
  estimateMachineNodeHeightFromPorts,
  getMachineNodeRect,
} from '@/canvas/node-bounds';
import { normalizePortId, parsePortId } from '@/canvas/ports';
import type { PackData } from '@/data/types';
import {
  computeEdgeRouteCenter,
  edgePathNeedsObstacleRouting,
  getRoutedSmoothStepPath,
  pathHitsThirdPartyObstacles,
  type EdgeRouteEndpoints,
  type RoutingObstacle,
} from '@/lib/edge-routing';

const pack = JSON.parse(
  fs.readFileSync(
    path.join(process.cwd(), 'public/data/packs/0.12.8/pack.json'),
    'utf8',
  ),
) as PackData;

const tfgp = JSON.parse(
  fs.readFileSync(
    path.join(process.cwd(), 'Untitled (18).tfgp'),
    'utf8',
  ),
) as {
  nodes: Array<{
    id: string;
    machineId: string;
    recipeId: string;
    position: { x: number; y: number };
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    sourcePort: string;
    targetPort: string;
  }>;
};

function estimatePortCenter(
  node: {
    position: { x: number; y: number };
    machineId: string;
    recipeId: string;
  },
  port: string,
) {
  const parsed = parsePortId(normalizePortId(port));
  if (!parsed) return { x: node.position.x, y: node.position.y };
  const portsTopY =
    estimateHeaderHeight(pack, node.machineId, node.recipeId) +
    node.position.y;
  const y =
    portsTopY + parsed.index * PORT_ROW_HEIGHT + PORT_ROW_HEIGHT / 2;
  const x =
    parsed.kind === 'in'
      ? node.position.x
      : node.position.x + MACHINE_NODE_WIDTH;
  return { x, y };
}

function makeNode(
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
      surplusLines: [],
      machineCount: 1,
      overclock: 1,
      parallel: 1,
      onRecipeChange: () => {},
      onMachineCountChange: () => {},
      onOverclockChange: () => {},
      onPortContextMenu: () => {},
    },
    measured: { width: MACHINE_NODE_WIDTH, height },
  };
}

const scheme18Nodes = new Map(
  tfgp.nodes.map((n) => [
    n.id,
    makeNode(n.id, n.machineId, n.recipeId, n.position),
  ]),
);

const allObstacles: RoutingObstacle[] = [...scheme18Nodes.values()].map(
  (node) => ({
    nodeId: node.id,
    rect: getMachineNodeRect(node),
  }),
);

function horizontalLaneY(waypoints: { x: number; y: number }[]): number | undefined {
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i]!;
    const b = waypoints[i + 1]!;
    if (a.y === b.y && Math.abs(a.x - b.x) > 40) return a.y;
  }
  return undefined;
}

function simulateEdge(edgeId: string) {
  const edge = tfgp.edges.find((e) => e.id === edgeId);
  if (!edge) throw new Error(`missing ${edgeId}`);

  const sourceNode = scheme18Nodes.get(edge.source)!;
  const targetNode = scheme18Nodes.get(edge.target)!;
  const srcData = sourceNode.data as MachineNodeData;
  const tgtData = targetNode.data as MachineNodeData;
  const src = estimatePortCenter(
    {
      position: sourceNode.position,
      machineId: srcData.machineId,
      recipeId: srcData.recipeId,
    },
    edge.sourcePort,
  );
  const tgt = estimatePortCenter(
    {
      position: targetNode.position,
      machineId: tgtData.machineId,
      recipeId: tgtData.recipeId,
    },
    edge.targetPort,
  );

  const endpoints: EdgeRouteEndpoints = {
    sourceX: src.x,
    sourceY: src.y,
    targetX: tgt.x,
    targetY: tgt.y,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  };
  const routing = { sourceId: edge.source, targetId: edge.target };
  const needs = edgePathNeedsObstacleRouting(endpoints, allObstacles, routing);
  const routeCenter = needs
    ? computeEdgeRouteCenter(endpoints, allObstacles, routing)
    : null;
  const routed = needs
    ? getRoutedSmoothStepPath(endpoints, allObstacles, routing)
    : null;

  return {
    edgeId,
    endpoints,
    needs,
    routeCenter,
    laneY: routed ? horizontalLaneY(routed.waypoints) : undefined,
    waypoints: routed?.waypoints,
    thirdPartyHits: needs
      ? pathHitsThirdPartyObstacles(
          endpoints,
          routeCenter ?? {},
          allObstacles,
          20,
          routing,
        )
      : 0,
  };
}

describe('scheme 18 edge routing simulation', () => {
  it('edge_46 benzene routes below distillation card, not through recipe area', () => {
    const s = simulateEdge('edge_46');
    const sourceRect = getMachineNodeRect(scheme18Nodes.get('node_37')!);

    expect(s.needs).toBe(true);
    expect(s.laneY).toBeDefined();
    expect(s.laneY!).toBeGreaterThan(sourceRect.bottom);
    expect(s.laneY!).toBeLessThan(650);
    expect(s.thirdPartyHits).toBe(0);
  });

  it('no edge crosses third-party machine cards', () => {
    for (const edge of tfgp.edges) {
      const s = simulateEdge(edge.id);
      expect(s.thirdPartyHits, edge.id).toBe(0);
    }
  });
});
