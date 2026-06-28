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
import {
  bezierHitsThirdPartyObstacles,
  computeEdgeRouteCenter,
  edgePathNeedsObstacleRouting,
  getRoutedSmoothStepPath,
  pathHitsThirdPartyObstacles,
  type EdgeRouteEndpoints,
  type RoutingObstacle,
} from '@/lib/edge-routing';
import { loadTestPack } from '@/test-fixtures/load-test-pack';

const BENZENE_GAP_FIXTURE = path.join(
  process.cwd(),
  'src/lib/fixtures/edge-routing/benzene-distillation-lcr-gap.tfgp',
);

const pack = loadTestPack('0.12.8');

type FixtureGraph = {
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

const fixture = JSON.parse(
  fs.readFileSync(BENZENE_GAP_FIXTURE, 'utf8'),
) as FixtureGraph;

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
      balanceLines: [],
      machineCount: 1,
      overclock: 1,
      voltageTier: 'LV',
      parallel: 1,
      onRecipeChange: () => {},
      onMachineCountChange: () => {},
      onOverclockChange: () => {},
      onPortContextMenu: () => {},
    },
    measured: { width: MACHINE_NODE_WIDTH, height },
  };
}

function horizontalLaneY(
  waypoints: { x: number; y: number }[],
): number | undefined {
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i]!;
    const b = waypoints[i + 1]!;
    if (a.y === b.y && Math.abs(a.x - b.x) > 40) return a.y;
  }
  return undefined;
}

function laneRunsThroughGap(
  laneY: number,
  upperBottom: number,
  lowerTop: number,
): boolean {
  return laneY > upperBottom && laneY < lowerTop;
}

function buildGraph(graph: FixtureGraph) {
  const nodes = new Map(
    graph.nodes.map((n) => [
      n.id,
      makeNode(n.id, n.machineId, n.recipeId, n.position),
    ]),
  );
  const obstacles: RoutingObstacle[] = [...nodes.values()].map((node) => ({
    nodeId: node.id,
    rect: getMachineNodeRect(node),
  }));
  return { nodes, obstacles };
}

const { nodes: fixtureNodes, obstacles: fixtureObstacles } =
  buildGraph(fixture);

function simulateFixtureEdge(edgeId: string) {
  const edge = fixture.edges.find((e) => e.id === edgeId);
  if (!edge) throw new Error(`missing ${edgeId}`);

  const sourceNode = fixtureNodes.get(edge.source)!;
  const targetNode = fixtureNodes.get(edge.target)!;
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
  const needs = edgePathNeedsObstacleRouting(
    endpoints,
    fixtureObstacles,
    routing,
  );
  const routeCenter = needs
    ? computeEdgeRouteCenter(endpoints, fixtureObstacles, routing)
    : null;
  const routed = needs
    ? getRoutedSmoothStepPath(endpoints, fixtureObstacles, routing)
    : null;

  return {
    edgeId,
    endpoints,
    needs,
    routeCenter,
    laneY: routed ? horizontalLaneY(routed.waypoints) : undefined,
    thirdPartyHits: needs
      ? pathHitsThirdPartyObstacles(
          endpoints,
          routeCenter ?? {},
          fixtureObstacles,
          20,
          routing,
        )
      : bezierHitsThirdPartyObstacles(endpoints, fixtureObstacles, routing)
        ? 1
        : 0,
  };
}

function simulatePairEdge(
  sourceId: string,
  targetId: string,
  sourcePort: string,
  targetPort: string,
  node37Pos: { x: number; y: number },
  node44Pos: { x: number; y: number },
) {
  const n37 = makeNode(
    'node_37',
    'gtceu:distillation_tower',
    'gtceu:distill_wood_tar',
    node37Pos,
  );
  const n44 = makeNode(
    'node_44',
    'gtceu:large_chemical_reactor',
    'tfg:aromatic_feedstock@lcr',
    node44Pos,
  );
  const d37 = n37.data as MachineNodeData;
  const d44 = n44.data as MachineNodeData;
  const src = estimatePortCenter(
    {
      position: node37Pos,
      machineId: d37.machineId,
      recipeId: d37.recipeId,
    },
    sourcePort,
  );
  const tgt = estimatePortCenter(
    {
      position: node44Pos,
      machineId: d44.machineId,
      recipeId: d44.recipeId,
    },
    targetPort,
  );
  const endpoints: EdgeRouteEndpoints = {
    sourceX: src.x,
    sourceY: src.y,
    targetX: tgt.x,
    targetY: tgt.y,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  };
  const obstacles: RoutingObstacle[] = [
    { nodeId: 'node_37', rect: getMachineNodeRect(n37) },
    { nodeId: 'node_44', rect: getMachineNodeRect(n44) },
  ];
  const routing = { sourceId, targetId };
  const routed = getRoutedSmoothStepPath(endpoints, obstacles, routing);
  const r37 = obstacles[0]!.rect;
  const r44 = obstacles[1]!.rect;
  const laneY = horizontalLaneY(routed.waypoints);
  const gapMidY = (r44.bottom + r37.top) / 2;

  return {
    endpoints,
    r37,
    r44,
    gapHeight: r37.top - r44.bottom,
    gapMidY,
    needs: edgePathNeedsObstacleRouting(endpoints, obstacles, routing),
    routeCenter: routed.center,
    laneY,
    throughGap:
      laneY !== undefined &&
      laneRunsThroughGap(laneY, r44.bottom, r37.top),
    waypoints: routed.waypoints,
  };
}

describe('edge routing integration (benzene-distillation-lcr-gap fixture)', () => {
  it('edge_46 routes benzene through the gap between node_37 and node_44', () => {
    const s = simulateFixtureEdge('edge_46');
    const r37 = getMachineNodeRect(fixtureNodes.get('node_37')!);
    const r44 = getMachineNodeRect(fixtureNodes.get('node_44')!);
    const gapMidY = (r44.bottom + r37.top) / 2;

    expect(s.needs).toBe(true);
    expect(s.routeCenter).toEqual({ centerY: gapMidY });
    expect(s.laneY).toBeDefined();
    expect(laneRunsThroughGap(s.laneY!, r44.bottom, r37.top)).toBe(true);
    expect(Math.abs(s.laneY! - gapMidY)).toBeLessThan(1);
    expect(s.thirdPartyHits).toBe(0);
  });

  it('no edge on the fixture graph crosses third-party machine cards', () => {
    for (const edge of fixture.edges) {
      const s = simulateFixtureEdge(edge.id);
      expect(s.thirdPartyHits, edge.id).toBe(0);
    }
  });

  it('short local edges edge_45 and edge_50 stay on bezier routing', () => {
    for (const edgeId of ['edge_45', 'edge_50'] as const) {
      expect(simulateFixtureEdge(edgeId).needs).toBe(false);
    }
  });
});

describe('edge_46 benzene routing regressions (inline coordinates)', () => {
  const node44Pos = { x: 1480.8144989315085, y: 223.0615111533882 };

  it('routes wide-gap layouts through the vertical gap between cards', () => {
    const wideGap = simulatePairEdge(
      'node_37',
      'node_44',
      'out_2',
      'in_1',
      { x: 1487.1623803587415, y: 577.1335426219641 },
      node44Pos,
    );
    const mediumGap = simulatePairEdge(
      'node_37',
      'node_44',
      'out_2',
      'in_1',
      { x: 1488.3110787137387, y: 566.7952574269908 },
      node44Pos,
    );

    expect(wideGap.gapHeight).toBeGreaterThan(100);
    expect(mediumGap.gapHeight).toBeGreaterThan(100);
    expect(wideGap.needs).toBe(true);
    expect(mediumGap.needs).toBe(true);
    expect(wideGap.routeCenter).toEqual({ centerY: wideGap.gapMidY });
    expect(mediumGap.routeCenter).toEqual({ centerY: mediumGap.gapMidY });
    expect(Math.abs(wideGap.laneY! - wideGap.gapMidY)).toBeLessThan(1);
    expect(Math.abs(mediumGap.laneY! - mediumGap.gapMidY)).toBeLessThan(1);
    expect(wideGap.throughGap).toBe(true);
    expect(mediumGap.throughGap).toBe(true);
  });

  it('still routes when the two cards nearly touch', () => {
    const tightGap = simulatePairEdge(
      'node_37',
      'node_44',
      'out_2',
      'in_1',
      { x: 1488.3110787137387, y: 401.38269430741786 },
      node44Pos,
    );

    expect(tightGap.gapHeight).toBeLessThan(8);
    expect(tightGap.needs).toBe(true);
  });

  it('uses the gap lane when the handle midpoint would cut through a card body', () => {
    const node37Pos = {
      x: 1488.3110787137387,
      y: 566.7952574269908,
    };
    const n37 = makeNode(
      'node_37',
      'gtceu:distillation_tower',
      'gtceu:distill_wood_tar',
      node37Pos,
    );
    const n44 = makeNode(
      'node_44',
      'gtceu:large_chemical_reactor',
      'tfg:aromatic_feedstock@lcr',
      node44Pos,
    );
    const d37 = n37.data as MachineNodeData;
    const d44 = n44.data as MachineNodeData;
    const src = estimatePortCenter(
      {
        position: node37Pos,
        machineId: d37.machineId,
        recipeId: d37.recipeId,
      },
      'out_2',
    );
    const tgt = estimatePortCenter(
      {
        position: node44Pos,
        machineId: d44.machineId,
        recipeId: d44.recipeId,
      },
      'in_1',
    );
    const endpoints: EdgeRouteEndpoints = {
      sourceX: src.x,
      sourceY: src.y,
      targetX: tgt.x,
      targetY: tgt.y,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
    const r37 = getMachineNodeRect(n37);
    const r44 = getMachineNodeRect(n44);
    const expandedSourceTop = r37.top - 80;
    const gapMidY = (r44.bottom + expandedSourceTop) / 2;
    const obstacles: RoutingObstacle[] = [
      {
        nodeId: 'node_37',
        rect: { ...r37, top: expandedSourceTop },
      },
      { nodeId: 'node_44', rect: r44 },
    ];
    const routing = { sourceId: 'node_37', targetId: 'node_44' };

    expect(computeEdgeRouteCenter(endpoints, obstacles, routing)).toEqual({
      centerY: gapMidY,
    });

    const { waypoints } = getRoutedSmoothStepPath(endpoints, obstacles, routing);
    const laneY = horizontalLaneY(waypoints);
    expect(laneY).toBeDefined();
    expect(laneY!).toBeGreaterThan(r44.bottom);
    expect(laneY!).toBeLessThan(expandedSourceTop);
    expect(Math.abs(laneY! - gapMidY)).toBeLessThan(1);
  });
});
