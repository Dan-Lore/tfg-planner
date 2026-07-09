import { describe, expect, it } from 'vitest';
import {
  computeEdgeRouteCenter,
  pathCrossesNodeBody,
  type RoutingObstacle,
} from '@/editor-graph/edge-routing';
import { buildEdgeRoutePlan } from '@/editor-graph/edge-route-plan';
import { minCorridorSeparation, PARALLEL_EDGE_GAP } from '@/editor-graph/edge-route-lanes';
import {
  buildFixtureGraph,
  getMachineNodeRect,
  horizontalLaneY,
  laneRunsThroughGap,
  loadFixtureGraph,
  makeMachineNode,
  sharedCorridorPairs,
  simulateFlowEdgePath,
  simulateGraphEdges,
  type FixtureGraph,
} from '@/editor-graph/edge-routing-test-harness';

const BENZENE_GAP_FIXTURE =
  'src/lib/fixtures/edge-routing/benzene-distillation-lcr-gap.tfgp';
const REBRA_FIXTURE =
  'src/lib/fixtures/edge-routing/rebra-rhenium-loop.tfgp';

const benzeneGraph = loadFixtureGraph(BENZENE_GAP_FIXTURE);
const rebraGraph = loadFixtureGraph(REBRA_FIXTURE);

function simulateFixtureEdge(graph: FixtureGraph, edgeId: string) {
  return simulateGraphEdges(graph).find((e) => e.edgeId === edgeId)!;
}

function simulatePairEdge(
  sourceId: string,
  targetId: string,
  sourcePort: string,
  targetPort: string,
  node37Pos: { x: number; y: number },
  node44Pos: { x: number; y: number },
) {
  const graph: FixtureGraph = {
    nodes: [
      {
        id: 'node_37',
        machineId: 'gtceu:distillation_tower',
        recipeId: 'gtceu:distill_wood_tar',
        position: node37Pos,
      },
      {
        id: 'node_44',
        machineId: 'gtceu:large_chemical_reactor',
        recipeId: 'tfg:aromatic_feedstock@lcr',
        position: node44Pos,
      },
    ],
    edges: [
      {
        id: 'edge_pair',
        source: sourceId,
        target: targetId,
        sourcePort,
        targetPort,
      },
    ],
  };
  const s = simulateGraphEdges(graph)[0]!;
  const n37 = makeMachineNode(
    'node_37',
    'gtceu:distillation_tower',
    'gtceu:distill_wood_tar',
    node37Pos,
  );
  const n44 = makeMachineNode(
    'node_44',
    'gtceu:large_chemical_reactor',
    'tfg:aromatic_feedstock@lcr',
    node44Pos,
  );
  const r37 = getMachineNodeRect(n37);
  const r44 = getMachineNodeRect(n44);
  const gapMidY = (r44.bottom + r37.top) / 2;

  return {
    endpoints: s.endpoints,
    r37,
    r44,
    gapHeight: r37.top - r44.bottom,
    gapMidY,
    needs: s.needs,
    routeCenter: s.laneCenter,
    laneY: s.laneY,
    throughGap:
      s.laneY !== undefined &&
      laneRunsThroughGap(s.laneY, r44.bottom, r37.top),
    waypoints: s.waypoints,
  };
}

describe('edge routing integration (benzene-distillation-lcr-gap fixture)', () => {
  it('edge_46 routes benzene through the gap between node_37 and node_44', () => {
    const s = simulateFixtureEdge(benzeneGraph, 'edge_46');
    const { nodes } = buildFixtureGraph(benzeneGraph);
    const r37 = getMachineNodeRect(nodes.get('node_37')!);
    const r44 = getMachineNodeRect(nodes.get('node_44')!);
    const gapMidY = (r44.bottom + r37.top) / 2;

    expect(s.needs).toBe(true);
    expect(s.laneCenter).toEqual({ centerY: gapMidY });
    expect(s.laneY).toBeDefined();
    expect(laneRunsThroughGap(s.laneY!, r44.bottom, r37.top)).toBe(true);
    expect(Math.abs(s.laneY! - gapMidY)).toBeLessThan(1);
    expect(s.thirdPartyHits).toBe(0);
  });

  it('no edge on the fixture graph crosses third-party machine cards', () => {
    for (const s of simulateGraphEdges(benzeneGraph)) {
      expect(s.thirdPartyHits, s.edgeId).toBe(0);
    }
  });

  it('short local edges edge_45 and edge_50 stay on bezier routing', () => {
    for (const edgeId of ['edge_45', 'edge_50'] as const) {
      expect(simulateFixtureEdge(benzeneGraph, edgeId).needs).toBe(false);
    }
  });

  it('parallel edges through node_37↔node_44 gap are separated by at least PARALLEL_EDGE_GAP', () => {
    const edges = simulateGraphEdges(benzeneGraph);
    const gapEdges = edges.filter(
      (e) =>
        e.needs &&
        ((e.source === 'node_37' && e.target === 'node_44') ||
          (e.source === 'node_44' && e.target === 'node_37')),
    );
    if (gapEdges.length >= 2) {
      for (const [a, b] of sharedCorridorPairs(gapEdges)) {
        const sep = Math.abs((a.laneY ?? 0) - (b.laneY ?? 0));
        if (sep > 0) expect(sep).toBeGreaterThanOrEqual(PARALLEL_EDGE_GAP);
      }
    }
  });
});

function horizontalLaneYFromWaypoints(
  waypoints: { x: number; y: number }[],
): number | undefined {
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i]!;
    const b = waypoints[i + 1]!;
    if (Math.abs(a.y - b.y) < 0.5 && Math.abs(a.x - b.x) > 40) return a.y;
  }
  return undefined;
}

describe('edge routing integration (rebra-rhenium-loop fixture)', () => {
  it('no edge crosses third-party node cards', () => {
    for (const s of simulateGraphEdges(rebraGraph)) {
      expect(s.thirdPartyHits, s.edgeId).toBe(0);
    }
  });

  it('edge_132 cracker off-gas does not cut through electrolyzer body', () => {
    const s = simulateFixtureEdge(rebraGraph, 'edge_132');
    const { obstacles } = buildFixtureGraph(rebraGraph);
    expect(s.needs).toBe(true);
    expect(
      pathCrossesNodeBody(
        s.endpoints,
        s.laneCenter,
        'node_131',
        obstacles,
        20,
        { sourceId: s.source, targetId: s.target },
      ),
    ).toBe(0);
  });

  it('edge_140 rhenium dust does not cut through Re buffer body (FlowEdge path)', () => {
    const r = simulateFlowEdgePath(rebraGraph, 'edge_140');
    expect(r.edge.needs).toBe(true);
    expect(r.targetBodyHits, r.edge.edgeId).toBe(0);
    expect(r.sourceBodyHits, r.edge.edgeId).toBe(0);
    expect(r.thirdPartyHits).toBe(0);
    const bufRect = r.obstacles.find((o) => o.nodeId === 'node_139')!.rect;
    const elRect = r.obstacles.find((o) => o.nodeId === 'node_131')!.rect;
    const laneY = horizontalLaneYFromWaypoints(r.waypoints);
    expect(laneY).toBeDefined();
    expect(laneY!).toBeLessThan(bufRect.top);
    expect(laneY!).toBeLessThan(elRect.top);
  });

  it('edge_140 avoids buffer and electrolyzer with measured card heights', () => {
    const { nodes } = buildFixtureGraph(rebraGraph);
    const elNode = nodes.get('node_131')!;
    const estimatedElH = elNode.measured?.height ?? 178;
    const r = simulateFlowEdgePath(rebraGraph, 'edge_140', {
      node_131: estimatedElH + 18,
      node_139: 140,
    });
    expect(r.sourceBodyHits).toBe(0);
    expect(r.targetBodyHits).toBe(0);
    const laneY = horizontalLaneYFromWaypoints(r.waypoints);
    const elRect = r.obstacles.find((o) => o.nodeId === 'node_131')!.rect;
    const bufRect = r.obstacles.find((o) => o.nodeId === 'node_139')!.rect;
    expect(laneY).toBeDefined();
    expect(laneY!).toBeLessThan(elRect.top);
    expect(laneY!).toBeLessThan(bufRect.top);
  });

  it('edge_140 avoids buffer body with measured card height', () => {
    const r = simulateFlowEdgePath(rebraGraph, 'edge_140', { node_139: 140 });
    expect(r.targetBodyHits).toBe(0);
    expect(r.sourceBodyHits).toBe(0);
  });

  it('parallel edges in shared corridors are separated by at least PARALLEL_EDGE_GAP', () => {
    const edges = simulateGraphEdges(rebraGraph);
    for (const [a, b] of sharedCorridorPairs(edges)) {
      expect(
        minCorridorSeparation(a.waypoints, b.waypoints),
        `${a.edgeId} vs ${b.edgeId}`,
      ).toBeGreaterThanOrEqual(PARALLEL_EDGE_GAP);
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
    const n37 = makeMachineNode(
      'node_37',
      'gtceu:distillation_tower',
      'gtceu:distill_wood_tar',
      node37Pos,
    );
    const n44 = makeMachineNode(
      'node_44',
      'gtceu:large_chemical_reactor',
      'tfg:aromatic_feedstock@lcr',
      node44Pos,
    );
    const graph: FixtureGraph = {
      nodes: [
        {
          id: 'node_37',
          machineId: 'gtceu:distillation_tower',
          recipeId: 'gtceu:distill_wood_tar',
          position: node37Pos,
        },
        {
          id: 'node_44',
          machineId: 'gtceu:large_chemical_reactor',
          recipeId: 'tfg:aromatic_feedstock@lcr',
          position: node44Pos,
        },
      ],
      edges: [
        {
          id: 'edge_46',
          source: 'node_37',
          target: 'node_44',
          sourcePort: 'out_2',
          targetPort: 'in_1',
        },
      ],
    };
    const { obstacles } = buildFixtureGraph(graph);
    const s = simulateGraphEdges(graph)[0]!;
    const r37 = getMachineNodeRect(n37);
    const r44 = getMachineNodeRect(n44);
    const expandedSourceTop = r37.top - 80;
    const gapMidY = (r44.bottom + expandedSourceTop) / 2;
    const obstaclesExpanded: RoutingObstacle[] = [
      {
        nodeId: 'node_37',
        rect: { ...r37, top: expandedSourceTop },
      },
      { nodeId: 'node_44', rect: r44 },
    ];
    void obstacles;

    expect(
      computeEdgeRouteCenter(s.endpoints, obstaclesExpanded, {
        sourceId: 'node_37',
        targetId: 'node_44',
      }),
    ).toEqual({
      centerY: gapMidY,
    });

    const plan = buildEdgeRoutePlan(
      [
        {
          edgeId: 'edge_46',
          endpoints: s.endpoints,
          routing: { sourceId: 'node_37', targetId: 'node_44' },
        },
      ],
      obstaclesExpanded,
    );
    const laneY = horizontalLaneY(plan.get('edge_46')!.waypoints);
    expect(laneY).toBeDefined();
    expect(laneY!).toBeGreaterThan(r44.bottom);
    expect(laneY!).toBeLessThan(expandedSourceTop);
    expect(Math.abs(laneY! - gapMidY)).toBeLessThan(1);
  });
});
