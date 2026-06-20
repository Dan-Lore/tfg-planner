import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Position, type Node } from '@xyflow/react';
import { pointOnBezierEdge } from '@/lib/bezier-edge-label';
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
  bezierHitsThirdPartyObstacles,
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
    path.join(process.cwd(), 'Untitled (17).tfgp'),
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

const scheme17Nodes = new Map(
  tfgp.nodes.map((n) => [
    n.id,
    makeNode(n.id, n.machineId, n.recipeId, n.position),
  ]),
);

const allObstacles: RoutingObstacle[] = [...scheme17Nodes.values()].map(
  (node) => ({
    nodeId: node.id,
    rect: getMachineNodeRect(node),
  }),
);

function bezierPathLength(endpoints: EdgeRouteEndpoints, samples = 32): number {
  let total = 0;
  let prev = pointOnBezierEdge(endpoints, 0);
  for (let i = 1; i <= samples; i++) {
    const current = pointOnBezierEdge(endpoints, i / samples);
    total += Math.hypot(current.x - prev.x, current.y - prev.y);
    prev = current;
  }
  return total;
}

function polylinePathLength(points: { x: number; y: number }[]): number {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

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

  const sourceNode = scheme17Nodes.get(edge.source)!;
  const targetNode = scheme17Nodes.get(edge.target)!;
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
  const bezierLen = bezierPathLength(endpoints);
  const routed = needs
    ? getRoutedSmoothStepPath(endpoints, allObstacles, routing)
    : null;
  const routedLen = routed ? polylinePathLength(routed.waypoints) : bezierLen;

  return {
    edgeId,
    endpoints,
    needs,
    routeCenter,
    bezierLen,
    routedLen,
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
      : bezierHitsThirdPartyObstacles(endpoints, allObstacles, routing)
        ? 1
        : 0,
  };
}

describe('scheme 17 edge routing simulation', () => {
  it('logs diagnostics for problematic edges', () => {
    for (const edgeId of ['edge_46', 'edge_33', 'edge_34', 'edge_50', 'edge_45']) {
      const s = simulateEdge(edgeId);
      expect(s.bezierLen).toBeGreaterThan(0);
      // eslint-disable-next-line no-console -- routing simulation output
      console.log(edgeId, {
        needs: s.needs,
        routeCenter: s.routeCenter,
        bezierLen: Math.round(s.bezierLen),
        routedLen: Math.round(s.routedLen),
        laneY: s.laneY,
      });
    }
  });

  it('no edge crosses third-party machine cards', () => {
    for (const edge of tfgp.edges) {
      const s = simulateEdge(edge.id);
      expect(s.thirdPartyHits, edge.id).toBe(0);
    }
  });

  it('edge_46 benzene avoids deep bottom detour when routed', () => {
    const s = simulateEdge('edge_46');
    if (s.needs) {
      expect(s.laneY).toBeDefined();
      expect(s.laneY!).toBeLessThan(650);
    } else {
      expect(
        bezierHitsThirdPartyObstacles(s.endpoints, allObstacles, {
          sourceId: 'node_37',
          targetId: 'node_44',
        }),
      ).toBe(false);
    }
  });

  it('edge_33 and edge_34 avoid deep bottom detour when routed', () => {
    for (const edgeId of ['edge_33', 'edge_34'] as const) {
      const s = simulateEdge(edgeId);
      if (s.needs) {
        expect(s.laneY).toBeDefined();
        expect(s.laneY!).toBeLessThan(650);
      }
    }
  });

  it('edge_50 syngas uses bezier like edge_45', () => {
    const s45 = simulateEdge('edge_45');
    const s50 = simulateEdge('edge_50');

    expect(s45.needs).toBe(false);
    expect(s50.needs).toBe(false);
  });

  it('routed smooth-step paths stay shorter than a deep bottom bypass when needed', () => {
    const deepBypassY = 650;
    for (const edgeId of ['edge_46', 'edge_33', 'edge_34', 'edge_50']) {
      const s = simulateEdge(edgeId);
      if (s.needs) {
        expect(s.laneY).toBeDefined();
        expect(s.laneY!).toBeLessThan(deepBypassY);
      }
    }
  });
});
