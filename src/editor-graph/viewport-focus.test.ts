import { describe, expect, it } from 'vitest';
import {
  animateViewport,
  flowPointAtCanvasCenter,
  resolveIssueFocusPoint,
  viewportToCenterOn,
  type ViewportState,
} from '@/editor-graph/viewport-focus';
import type { PackLike } from '@/data/pack-registry';
import type { SchemeIssue } from '@/scheme-check/check-scheme';
import type { TfgpEdge, TfgpNode } from '@/schema/tfgp';

const miniPack = {
  modpack: { version: '0.12.8', dataVersion: 1 },
  machines: [{ id: 'm', name: { en: 'M', ru: 'M' } }],
  recipes: [
    {
      id: 'r',
      machineId: 'm',
      durationTicks: 100,
      inputs: [{ itemId: 'in', amount: 1 }],
      outputs: [{ itemId: 'out', amount: 1 }],
    },
  ],
  items: [],
  fluids: [],
  tags: [],
} as unknown as PackLike;

describe('viewportToCenterOn', () => {
  it('places point at canvas center', () => {
    const vp = viewportToCenterOn({ x: 100, y: 200 }, 1, 800, 600);
    expect(vp).toEqual({ x: 300, y: 100, zoom: 1 });
  });

  it('keeps zoom unchanged', () => {
    const vp = viewportToCenterOn({ x: 0, y: 0 }, 2, 400, 300);
    expect(vp.zoom).toBe(2);
    expect(vp.x).toBe(200);
    expect(vp.y).toBe(150);
  });
});

describe('flowPointAtCanvasCenter', () => {
  it('inverts viewportToCenterOn', () => {
    const point = { x: 100, y: 200 };
    const zoom = 1.5;
    const width = 800;
    const height = 600;
    const vp = viewportToCenterOn(point, zoom, width, height);
    const recovered = flowPointAtCanvasCenter(vp, width, height);
    expect(recovered.x).toBeCloseTo(point.x);
    expect(recovered.y).toBeCloseTo(point.y);
  });
});

describe('resolveIssueFocusPoint', () => {
  const nodes: TfgpNode[] = [
    {
      id: 'a',
      machineId: 'm',
      recipeId: 'r',
      machineCount: 1,
      overclock: 1,
      voltageTier: 'LV',
      position: { x: 0, y: 0 },
    },
    {
      id: 'b',
      machineId: 'm',
      recipeId: 'r',
      machineCount: 1,
      overclock: 1,
      voltageTier: 'LV',
      position: { x: 400, y: 0 },
    },
  ];
  const edges: TfgpEdge[] = [
    {
      id: 'e1',
      source: 'a',
      target: 'b',
      sourcePort: 'out_0',
      targetPort: 'in_0',
      itemId: 'out',
    },
  ];
  const ctx = {
    nodes,
    edges,
    pack: miniPack,
    layoutWidthByNodeId: {},
    displayById: {},
  };

  it('returns node center for nodeId issue', () => {
    const issue: SchemeIssue = {
      severity: 'warning',
      code: 'disconnected_output',
      message: 'x',
      nodeId: 'a',
    };
    const point = resolveIssueFocusPoint(issue, ctx);
    expect(point).toBeDefined();
    expect(point!.x).toBeGreaterThan(0);
    expect(point!.y).toBeGreaterThan(0);
  });

  it('returns midpoint for edge issue', () => {
    const issue: SchemeIssue = {
      severity: 'error',
      code: 'product_mismatch',
      message: 'x',
      edgeId: 'e1',
    };
    const point = resolveIssueFocusPoint(issue, ctx)!;
    const a = resolveIssueFocusPoint({ ...issue, edgeId: undefined, nodeId: 'a' }, ctx)!;
    const b = resolveIssueFocusPoint({ ...issue, edgeId: undefined, nodeId: 'b' }, ctx)!;
    expect(point.x).toBeCloseTo((a.x + b.x) / 2, 0);
    expect(point.y).toBeCloseTo((a.y + b.y) / 2, 0);
  });

  it('returns centroid from context.nodeIds', () => {
    const issue: SchemeIssue = {
      severity: 'warning',
      code: 'cycle_not_running',
      message: 'x',
      context: { nodeIds: 'a, b' },
    };
    const point = resolveIssueFocusPoint(issue, ctx)!;
    const a = resolveIssueFocusPoint(
      { ...issue, context: undefined, nodeId: 'a' },
      ctx,
    )!;
    const b = resolveIssueFocusPoint(
      { ...issue, context: undefined, nodeId: 'b' },
      ctx,
    )!;
    expect(point.x).toBeCloseTo((a.x + b.x) / 2, 0);
  });
});

describe('animateViewport', () => {
  it('calls onComplete with target viewport', () => {
    const frames: ViewportState[] = [];
    let done: ViewportState | undefined;
    const from = { x: 0, y: 0, zoom: 1 };
    const to = { x: 100, y: 50, zoom: 1 };

    animateViewport(
      from,
      to,
      0,
      (vp) => frames.push({ ...vp }),
      (vp) => {
        done = vp;
      },
    );

    expect(frames).toHaveLength(1);
    expect(done).toEqual(to);
  });
});
