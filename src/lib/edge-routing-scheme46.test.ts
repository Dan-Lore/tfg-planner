import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Position, type Node } from '@xyflow/react';
import {
  computeEdgeRouteCenter,
  edgePathNeedsObstacleRouting,
  getRoutedSmoothStepPath,
  type EdgeRouteEndpoints,
  type RoutingObstacle,
} from '@/lib/edge-routing';
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

const pack = JSON.parse(
  fs.readFileSync(
    path.join(process.cwd(), 'public/data/packs/0.12.8/pack.json'),
    'utf8',
  ),
) as PackData;

const NODE_44_POS = { x: 1480.8144989315085, y: 223.0615111533882 };

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
      outputMultiplier: 1,
      onRecipeChange: () => {},
      onMachineCountChange: () => {},
      onOverclockChange: () => {},
      onPortContextMenu: () => {},
    },
    measured: { width: MACHINE_NODE_WIDTH, height },
  };
}

function horizontalLaneY(waypoints: { x: number; y: number }[]): number | undefined {
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

function simulateEdge46(node37Pos: { x: number; y: number }) {
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
    NODE_44_POS,
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
      position: NODE_44_POS,
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
  const obstacles: RoutingObstacle[] = [
    { nodeId: 'node_37', rect: getMachineNodeRect(n37) },
    { nodeId: 'node_44', rect: getMachineNodeRect(n44) },
  ];
  const routing = { sourceId: 'node_37', targetId: 'node_44' };
  const routed = getRoutedSmoothStepPath(endpoints, obstacles, routing);
  const r37 = obstacles[0]!.rect;
  const r44 = obstacles[1]!.rect;
  const laneY = horizontalLaneY(routed.waypoints);
  const gapHeight = r37.top - r44.bottom;
  const gapMidY = (r44.bottom + r37.top) / 2;

  return {
    endpoints,
    r37,
    r44,
    gapHeight,
    gapMidY,
    needs: edgePathNeedsObstacleRouting(endpoints, obstacles, routing),
    routeCenter: routed.center,
    laneY,
    throughGap:
      laneY !== undefined &&
      laneRunsThroughGap(laneY, r44.bottom, r37.top),
    waypoints: routed.waypoints,
    center: routed.center,
  };
}

describe('edge_46 benzene routing (node_37 -> node_44)', () => {
  it('routes schemes 14 and 15 through the gap when bezier clips endpoint cards', () => {
    const s14 = simulateEdge46({
      x: 1487.1623803587415,
      y: 577.1335426219641,
    });
    const s15 = simulateEdge46({
      x: 1488.3110787137387,
      y: 566.7952574269908,
    });

    expect(s14.gapHeight).toBeGreaterThan(100);
    expect(s15.gapHeight).toBeGreaterThan(100);
    expect(s14.needs).toBe(true);
    expect(s15.needs).toBe(true);
    expect(s14.routeCenter).toEqual({ centerY: s14.gapMidY });
    expect(s15.routeCenter).toEqual({ centerY: s15.gapMidY });
    expect(Math.abs(s14.laneY! - s14.gapMidY)).toBeLessThan(1);
    expect(Math.abs(s15.laneY! - s15.gapMidY)).toBeLessThan(1);
    expect(s14.throughGap).toBe(true);
    expect(s15.throughGap).toBe(true);
  });

  it('routes on scheme 16 when cards nearly touch', () => {
    const s16 = simulateEdge46({
      x: 1488.3110787137387,
      y: 401.38269430741786,
    });

    expect(s16.gapHeight).toBeLessThan(8);
    expect(s16.needs).toBe(true);
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
      NODE_44_POS,
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
        position: NODE_44_POS,
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
