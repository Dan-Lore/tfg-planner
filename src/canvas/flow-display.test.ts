import { describe, expect, it } from 'vitest';
import { R } from '@/calculator/rational';
import { buildEdgeFlowData } from '@/canvas/flow-display';
import type { PackData } from '@/data/types';
import type { TfgpEdge, TfgpNode } from '@/schema/tfgp';

const pack: PackData = {
  format: 'tfg-pack-data',
  formatVersion: 1,
  modpackVersion: 'test',
  dataVersion: 1,
  generatedAt: '2026-06-17T00:00:00Z',
  machines: [],
  items: [],
  fluids: [],
  recipes: [
    {
      id: 'mix',
      machineId: 'mixer',
      durationTicks: 100,
      inputs: [
        { itemId: 'a', amount: 2 },
        { itemId: 'b', amount: 1 },
        { itemId: 'c', amount: 1 },
      ],
      outputs: [{ itemId: 'out', amount: 1 }],
    },
  ],
};

const mixer: TfgpNode = {
  id: 'mixer1',
  machineId: 'mixer',
  recipeId: 'mix',
  position: { x: 300, y: 0 },
  machineCount: 2,
  overclock: 1,
  parallel: 1,
};

describe('buildEdgeFlowData', () => {
  it('keeps target label on each distinct ingredient fanning into one node', () => {
    const edges: TfgpEdge[] = [
      {
        id: 'e1',
        source: 'srcA',
        target: 'mixer1',
        sourcePort: 'out_0',
        targetPort: 'in_0',
        itemId: 'a',
      },
      {
        id: 'e2',
        source: 'srcB',
        target: 'mixer1',
        sourcePort: 'out_0',
        targetPort: 'in_1',
        itemId: 'b',
      },
      {
        id: 'e3',
        source: 'srcC',
        target: 'mixer1',
        sourcePort: 'out_0',
        targetPort: 'in_2',
        itemId: 'c',
      },
    ];

    const result = {
      edgeFlows: {},
      edgeTargetFlows: {},
      nodeOutputRates: {
        srcA: { a: R.from(4) },
        srcB: { b: R.from(2) },
        srcC: { c: R.from(1) },
      },
      nodePortOutputRates: {},
      nodeInputRates: {
        mixer1: { a: R.from(12), b: R.from(6), c: R.from(6) },
      },
      nodeSurplus: {},
      nodeMachineCounts: { mixer1: 2 },
    };

    const data = buildEdgeFlowData(edges, [mixer], pack, result);

    expect(data.e1?.target).toBe('12.00/s');
    expect(data.e2?.target).toBe('6.00/s');
    expect(data.e3?.target).toBe('6.00/s');
    expect(data.e1?.source).toBe('4.00/s');
    expect(data.e3?.source).toBe('1.00/s');
    expect(edges.filter((e) => data[e.id]?.target)).toHaveLength(3);
  });

  it('dedupes target labels when the same ingredient fan-ins on multiple edges', () => {
    const edges: TfgpEdge[] = [
      {
        id: 'e1',
        source: 'srcA',
        target: 'mixer1',
        sourcePort: 'out_0',
        targetPort: 'in_0',
        itemId: 'a',
      },
      {
        id: 'e2',
        source: 'srcB',
        target: 'mixer1',
        sourcePort: 'out_0',
        targetPort: 'in_1',
        itemId: 'a',
      },
    ];

    const result = {
      edgeFlows: {},
      edgeTargetFlows: {},
      nodeOutputRates: {
        srcA: { a: R.from(4) },
        srcB: { a: R.from(2) },
      },
      nodePortOutputRates: {},
      nodeInputRates: {
        mixer1: { a: R.from(12) },
      },
      nodeSurplus: {},
      nodeMachineCounts: { mixer1: 2 },
    };

    const data = buildEdgeFlowData(edges, [mixer], pack, result);

    const withTarget = edges.filter((e) => data[e.id]?.target);
    expect(withTarget).toHaveLength(1);
    expect(data[withTarget[0]!.id]?.target).toBe('12.00/s');
  });

  it('keeps label on a single incoming edge without dedup', () => {
    const edges: TfgpEdge[] = [
      {
        id: 'e1',
        source: 'srcA',
        target: 'mixer1',
        sourcePort: 'out_0',
        targetPort: 'in_0',
        itemId: 'a',
      },
    ];

    const result = {
      edgeFlows: {},
      edgeTargetFlows: {},
      nodeOutputRates: { srcA: { a: R.from(4) } },
      nodePortOutputRates: {},
      nodeInputRates: { mixer1: { a: R.from(12) } },
      nodeSurplus: {},
      nodeMachineCounts: { mixer1: 2 },
    };

    const data = buildEdgeFlowData(edges, [mixer], pack, result);
    expect(data.e1?.target).toBe('12.00/s');
  });

  it('dedupes source labels to the central outgoing edge at convergence', () => {
    const source: TfgpNode = {
      id: 'src',
      machineId: 'mixer',
      recipeId: 'mix',
      position: { x: 0, y: 0 },
      machineCount: 1,
      overclock: 1,
      parallel: 1,
    };

    const edges: TfgpEdge[] = [
      {
        id: 'o1',
        source: 'src',
        target: 't1',
        sourcePort: 'out_0',
        targetPort: 'in_0',
        itemId: 'out',
      },
      {
        id: 'o2',
        source: 'src',
        target: 't2',
        sourcePort: 'out_0',
        targetPort: 'in_0',
        itemId: 'out',
      },
    ];

    const result = {
      edgeFlows: {},
      edgeTargetFlows: {},
      nodeOutputRates: { src: { out: R.from(8) } },
      nodePortOutputRates: {
        src: { out_0: R.from(8) },
      },
      nodeInputRates: { t1: { out: R.from(8) }, t2: { out: R.from(8) } },
      nodeSurplus: {},
      nodeMachineCounts: { src: 1 },
    };

    const data = buildEdgeFlowData(edges, [source], pack, result);

    const withSourceLabel = edges.filter((e) => data[e.id]?.source);
    expect(withSourceLabel).toHaveLength(1);
  });

  it('keeps target on each distinct ingredient when two feeders converge on one machine', () => {
    const autoclave: TfgpNode = {
      id: 'auto',
      machineId: 'autoclave',
      recipeId: 'mix',
      position: { x: 600, y: 0 },
      machineCount: 1,
      overclock: 1,
      parallel: 1,
    };
    const mixer1: TfgpNode = {
      id: 'mixer1',
      machineId: 'mixer',
      recipeId: 'mix',
      position: { x: 0, y: -40 },
      machineCount: 1,
      overclock: 1,
      parallel: 1,
    };
    const mixer2: TfgpNode = {
      id: 'mixer2',
      machineId: 'mixer',
      recipeId: 'mix',
      position: { x: 0, y: 40 },
      machineCount: 1,
      overclock: 1,
      parallel: 1,
    };

    const edges: TfgpEdge[] = [
      {
        id: 'm1a',
        source: 'mixer1',
        target: 'auto',
        sourcePort: 'out_0',
        targetPort: 'in_0',
        itemId: 'a',
      },
      {
        id: 'm2a',
        source: 'mixer2',
        target: 'auto',
        sourcePort: 'out_0',
        targetPort: 'in_1',
        itemId: 'b',
      },
    ];

    const result = {
      edgeFlows: {},
      edgeTargetFlows: {},
      nodeOutputRates: {
        mixer1: { a: R.from(6) },
        mixer2: { b: R.from(4) },
      },
      nodePortOutputRates: {},
      nodeInputRates: {
        auto: { a: R.from(6), b: R.from(4) },
      },
      nodeSurplus: {},
      nodeMachineCounts: { mixer1: 1, mixer2: 1, auto: 1 },
    };

    const data = buildEdgeFlowData(edges, [mixer1, mixer2, autoclave], pack, result);

    expect(data.m1a?.source).toBe('6.00/s');
    expect(data.m2a?.source).toBe('4.00/s');
    expect(data.m1a?.target).toBe('6.00/s');
    expect(data.m2a?.target).toBe('4.00/s');
  });

  it('keeps source on each feeder when the same product fan-ins on one target', () => {
    const edges: TfgpEdge[] = [
      {
        id: 'm1a',
        source: 'mixer1',
        target: 'auto',
        sourcePort: 'out_0',
        targetPort: 'in_0',
        itemId: 'out',
      },
      {
        id: 'm2a',
        source: 'mixer2',
        target: 'auto',
        sourcePort: 'out_0',
        targetPort: 'in_1',
        itemId: 'out',
      },
    ];

    const result = {
      edgeFlows: {},
      edgeTargetFlows: {},
      nodeOutputRates: {
        mixer1: { out: R.from(8) },
        mixer2: { out: R.from(8) },
      },
      nodePortOutputRates: {},
      nodeInputRates: {
        auto: { out: R.from(8) },
      },
      nodeSurplus: {},
      nodeMachineCounts: {},
    };

    const data = buildEdgeFlowData(edges, [], pack, result);

    expect(data.m1a?.source).toBe('8.00/s');
    expect(data.m2a?.source).toBe('8.00/s');
    expect(edges.filter((e) => data[e.id]?.target)).toHaveLength(1);
  });

  it('keeps source on each parallel output port when the same product leaves on separate handles', () => {
    const greenhouse: TfgpNode = {
      id: 'gh',
      machineId: 'gtceu:greenhouse',
      recipeId: 'tfg:tfc_wood_sapling_pine/1',
      position: { x: 0, y: 0 },
      machineCount: 1,
      overclock: 1,
      parallel: 1,
    };
    const pyro: TfgpNode = {
      id: 'pyro',
      machineId: 'gtceu:pyrolyse_oven',
      recipeId: 'mix',
      position: { x: 400, y: 0 },
      machineCount: 1,
      overclock: 1,
      parallel: 1,
    };

    const edges: TfgpEdge[] = [
      {
        id: 'e0',
        source: 'gh',
        target: 'pyro',
        sourcePort: 'out_0',
        targetPort: 'in_0',
        itemId: 'tfc:wood/log/pine',
      },
      {
        id: 'e2',
        source: 'gh',
        target: 'pyro',
        sourcePort: 'out_2',
        targetPort: 'in_0',
        itemId: 'tfc:wood/log/pine',
      },
      {
        id: 'e3',
        source: 'gh',
        target: 'pyro',
        sourcePort: 'out_3',
        targetPort: 'in_0',
        itemId: 'tfc:wood/log/pine',
      },
    ];

    const result = {
      edgeFlows: {
        e0: R.from(64 / 600),
        e2: R.from(16 / 600),
        e3: R.from(16 / 600),
      },
      edgeTargetFlows: {},
      nodeOutputRates: {
        gh: { 'tfc:wood/log/pine': R.from(96 / 600) },
      },
      nodePortOutputRates: {
        gh: {
          out_0: R.from(64 / 600),
          out_1: R.from(4 / 600),
          out_2: R.from(16 / 600),
          out_3: R.from(16 / 600),
        },
      },
      nodeInputRates: {
        pyro: { 'tfc:wood/log/pine': R.from(96 / 600) },
      },
      nodeSurplus: {},
      nodeMachineCounts: { gh: 1, pyro: 1 },
    };

    const data = buildEdgeFlowData(edges, [greenhouse, pyro], pack, result);

    expect(data.e0?.source).toBe('0.1067/s');
    expect(data.e2?.source).toBe('0.0267/s');
    expect(data.e3?.source).toBe('0.0267/s');
    expect(edges.filter((e) => data[e.id]?.source)).toHaveLength(3);
    expect(edges.filter((e) => data[e.id]?.target)).toHaveLength(1);
  });
});
