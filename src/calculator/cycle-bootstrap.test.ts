import { describe, expect, it } from 'vitest';
import { R } from '@/calculator/rational';
import {
  computeCycleSeedFlow,
  computeCycleSeedDemand,
  findPrimaryCycleSeedEdge,
  intermediateBufferBootstrapCap,
  resolveCycleSeedMode,
} from '@/calculator/cycle-bootstrap';
import { findCycleComponents } from '@/calculator/cycle-analysis';
import type { SchemeEdge, SchemeNode } from '@/calculator/flow-solver-types';
import { buildTagIndex } from '@/lib/tag-index';
import type { PackData } from '@/data/types';

const rheniumNodes: SchemeNode[] = [
  {
    id: 'node_30',
    kind: 'machine',
    machineId: 'gtceu:cracker',
    recipeId: 'cracker',
    machineCount: 6,
    overclock: 1,
    voltageTier: 'HV',
  },
  {
    id: 'node_60',
    kind: 'start_buffer',
    machineId: '',
    recipeId: '',
    machineCount: 1,
    overclock: 1,
    voltageTier: 'LV',
    fluidId: 'gtceu:steam',
    autoSupplyRate: true,
    supplyMode: 'rate',
  },
  {
    id: 'node_96',
    kind: 'machine',
    machineId: 'gtceu:large_chemical_reactor',
    recipeId: 'lcr',
    machineCount: 1,
    overclock: 1,
    voltageTier: 'HV',
  },
  {
    id: 'node_131',
    kind: 'machine',
    machineId: 'gtceu:electrolyzer',
    recipeId: 'elec',
    machineCount: 1,
    overclock: 1,
    voltageTier: 'HV',
  },
  {
    id: 'node_139',
    kind: 'intermediate_buffer',
    machineId: '',
    recipeId: '',
    machineCount: 1,
    overclock: 1,
    voltageTier: 'LV',
    itemId: 'gtceu:tiny_rhenium_dust',
    capacity: 300,
  },
];

const rheniumEdges: SchemeEdge[] = [
  {
    id: 'edge_61',
    source: 'node_60',
    sourcePort: 'out_0',
    target: 'node_30',
    targetPort: 'in_1',
    fluidId: 'gtceu:steam',
  },
  {
    id: 'edge_98',
    source: 'node_96',
    target: 'node_30',
    sourcePort: 'out_0',
    targetPort: 'in_0',
    fluidId: 'tfg:reformed_aromatic_feedstock',
  },
  {
    id: 'edge_132',
    source: 'node_30',
    sourcePort: 'out_1',
    target: 'node_131',
    targetPort: 'in_0',
    fluidId: 'tfg:cracker_off_gas',
  },
  {
    id: 'edge_140',
    source: 'node_131',
    sourcePort: 'out_0',
    target: 'node_139',
    targetPort: 'in_0',
    itemId: 'gtceu:tiny_rhenium_dust',
  },
  {
    id: 'edge_141',
    source: 'node_139',
    target: 'node_96',
    sourcePort: 'out_0',
    targetPort: 'in_0',
    itemId: 'gtceu:tiny_rhenium_dust',
  },
];

const miniPack = {
  modpack: { version: '0.12.8', dataVersion: 1 },
  machines: [],
  recipes: [
    {
      id: 'cracker',
      machineId: 'gtceu:cracker',
      durationTicks: 100,
      inputs: [
        { fluidId: 'tfg:reformed_aromatic_feedstock', amount: 1000 },
        { fluidId: 'gtceu:steam', amount: 1000 },
      ],
      outputs: [
        { fluidId: 'tfg:reformate_gas', amount: 1000 },
        { fluidId: 'tfg:cracker_off_gas', amount: 500 },
      ],
    },
    {
      id: 'lcr',
      machineId: 'gtceu:large_chemical_reactor',
      durationTicks: 90,
      inputs: [
        { itemId: 'gtceu:tiny_rhenium_dust', amount: 1 },
        { fluidId: 'tfg:aromatic_feedstock', amount: 1000 },
      ],
      outputs: [{ fluidId: 'tfg:reformed_aromatic_feedstock', amount: 1000 }],
    },
    {
      id: 'elec',
      machineId: 'gtceu:electrolyzer',
      durationTicks: 90,
      inputs: [{ fluidId: 'tfg:cracker_off_gas', amount: 1000 }],
      outputs: [
        { itemId: 'gtceu:tiny_rhenium_dust', amount: 1, chance: 1000 },
        { fluidId: 'gtceu:carbon_dioxide', amount: 500 },
        { fluidId: 'gtceu:hydrogen', amount: 500 },
      ],
    },
  ],
  items: [],
  fluids: [],
  tags: [],
} as unknown as PackData;

describe('findPrimaryCycleSeedEdge', () => {
  it('prefers intermediate_buffer catalyst edge over start_buffer steam', () => {
    const scc = findCycleComponents(rheniumNodes, rheniumEdges)[0]!;
    const seed = findPrimaryCycleSeedEdge(scc, rheniumNodes, rheniumEdges);
    expect(seed?.id).toBe('edge_141');
  });
});

describe('intermediateBufferBootstrapCap', () => {
  it('uses capacity over horizon when initialStock is absent', () => {
    const cap = intermediateBufferBootstrapCap(rheniumNodes[4]!);
    expect(cap.toNumber()).toBeCloseTo(300 / 3600, 8);
  });
});

describe('resolveCycleSeedMode', () => {
  it('classifies near-zero net as stable', () => {
    expect(resolveCycleSeedMode(R.of(1, 10_000_000n))).toBe('stable');
  });

  it('classifies negative net as deficit', () => {
    expect(resolveCycleSeedMode(R.zero.sub(R.of(1, 2n)))).toBe('deficit');
  });

  it('classifies positive net as surplus', () => {
    expect(resolveCycleSeedMode(R.from(0.5))).toBe('surplus');
  });
});

describe('computeCycleSeedFlow', () => {
  it('caps seed flow by intermediate buffer stock', () => {
    const tags = buildTagIndex(miniPack);
    const recipes = new Map(miniPack.recipes.map((r) => [r.id, r]));
    const nodePortOutputRates = {
      node_96: { out_0: R.from(444.4444) },
    };
    const seedEdge = rheniumEdges.find((e) => e.id === 'edge_141')!;
    const flow = computeCycleSeedFlow(
      seedEdge,
      rheniumNodes,
      recipes,
      nodePortOutputRates,
      tags,
    );
    expect(flow.toNumber()).toBeGreaterThan(0);
    expect(flow.toNumber()).toBeLessThanOrEqual(300 / 3600 + 1e-9);
  });

  it('uses theoretical demand when intermediate buffer capacity is zero', () => {
    const zeroCapNodes = rheniumNodes.map((n) =>
      n.id === 'node_139' ? { ...n, capacity: 0 } : n,
    );
    const tags = buildTagIndex(miniPack);
    const recipes = new Map(miniPack.recipes.map((r) => [r.id, r]));
    const nodePortOutputRates = {
      node_96: { out_0: R.from(444.4444) },
    };
    const seedEdge = rheniumEdges.find((e) => e.id === 'edge_141')!;
    const demand = computeCycleSeedDemand(
      seedEdge,
      zeroCapNodes,
      recipes,
      nodePortOutputRates,
      tags,
    );
    const flow = computeCycleSeedFlow(
      seedEdge,
      zeroCapNodes,
      recipes,
      nodePortOutputRates,
      tags,
    );
    expect(demand.toNumber()).toBeGreaterThan(0);
    expect(flow.toNumber()).toBeCloseTo(demand.toNumber(), 8);
  });
});
