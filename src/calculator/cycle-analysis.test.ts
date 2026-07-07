import { describe, expect, it } from 'vitest';
import { findCycleComponents, analyzeCycles } from '@/calculator/cycle-analysis';
import { solveFlows } from '@/calculator/flow-solver';
import { computeReproductionPercent } from '@/lib/cycle-seed-metrics';
import type { PackData } from '@/data/types';
import { buildTagIndex } from '@/lib/tag-index';

const samplePack: PackData = {
  format: 'tfg-pack-data',
  formatVersion: 1,
  modpackVersion: 'test',
  dataVersion: 1,
  generatedAt: '2026-06-30T00:00:00Z',
  machines: [],
  items: [],
  fluids: [],
  recipes: [
    {
      id: 'pass',
      machineId: 'm',
      durationTicks: 20,
      inputs: [{ itemId: 'x', amount: 1 }],
      outputs: [{ itemId: 'x', amount: 1 }],
    },
    {
      id: 'src',
      machineId: 'm',
      durationTicks: 20,
      inputs: [],
      outputs: [{ itemId: 'x', amount: 2 }],
    },
    {
      id: 'reformed',
      machineId: 'lcr',
      durationTicks: 360,
      inputs: [
        { itemId: 'gtceu:tiny_rhenium_dust', amount: 1, chance: 1000 },
        { fluidId: 'aromatic', amount: 2000 },
      ],
      outputs: [{ fluidId: 'reformed', amount: 2000 }],
    },
    {
      id: 'cracker',
      machineId: 'cracker',
      durationTicks: 320,
      inputs: [
        { fluidId: 'reformed', amount: 2000 },
        { fluidId: 'steam', amount: 4000 },
      ],
      outputs: [
        { fluidId: 'reformate', amount: 8000 },
        { fluidId: 'off_gas', amount: 1000 },
      ],
    },
    {
      id: 'recycle',
      machineId: 'elec',
      durationTicks: 90,
      inputs: [{ fluidId: 'off_gas', amount: 1000 }],
      outputs: [
        { itemId: 'gtceu:tiny_rhenium_dust', amount: 1, chance: 1000 },
        { fluidId: 'co2', amount: 500 },
        { fluidId: 'h2', amount: 500 },
      ],
    },
  ],
};

describe('findCycleComponents', () => {
  it('finds a multi-node SCC', () => {
    const components = findCycleComponents(
      [
        { id: 'a', machineId: 'm', recipeId: 'pass', machineCount: 1, overclock: 1, voltageTier: 'LV' },
        { id: 'b', machineId: 'm', recipeId: 'pass', machineCount: 1, overclock: 1, voltageTier: 'LV' },
      ],
      [
        { id: 'e1', source: 'a', target: 'b', sourcePort: 'out_0', targetPort: 'in_0', itemId: 'x' },
        { id: 'e2', source: 'b', target: 'a', sourcePort: 'out_0', targetPort: 'in_0', itemId: 'x' },
      ],
    );
    expect(components).toHaveLength(1);
    expect(components[0]!.nodeIds.sort()).toEqual(['a', 'b']);
  });

  it('includes intermediate buffers in cycle graph', () => {
    const components = findCycleComponents(
      [
        { id: 'a', machineId: 'm', recipeId: 'pass', machineCount: 1, overclock: 1, voltageTier: 'LV' },
        { id: 'buf', kind: 'intermediate_buffer', itemId: 'x', machineId: '', recipeId: '', machineCount: 1, overclock: 1, voltageTier: 'LV' },
      ],
      [
        { id: 'e1', source: 'a', target: 'buf', sourcePort: 'out_0', targetPort: 'in_0', itemId: 'x' },
        { id: 'e2', source: 'buf', target: 'a', sourcePort: 'out_0', targetPort: 'in_0', itemId: 'x' },
      ],
    );
    expect(components[0]?.nodeIds.sort()).toEqual(['a', 'buf']);
  });
});

describe('analyzeCycles', () => {
  it('does not flag symmetric catalyst recipes as imbalanced', () => {
    const nodes = [
      {
        id: 'lcr',
        machineId: 'lcr',
        recipeId: 'reformed',
        machineCount: 1,
        overclock: 1,
        voltageTier: 'HV' as const,
      },
      {
        id: 'el',
        machineId: 'elec',
        recipeId: 'recycle',
        machineCount: 1,
        overclock: 1,
        voltageTier: 'HV' as const,
      },
    ];
    const flowResult = solveFlows({
      pack: samplePack,
      nodes: [
        ...nodes,
        {
          id: 'cr',
          machineId: 'cracker',
          recipeId: 'cracker',
          machineCount: 1,
          overclock: 1,
          voltageTier: 'HV',
        },
        {
          id: 'steam',
          kind: 'start_buffer' as const,
          fluidId: 'steam',
          supplyMode: 'rate' as const,
          autoSupplyRate: true,
          machineId: '',
          recipeId: '',
          machineCount: 1,
          overclock: 1,
          voltageTier: 'LV',
        },
        {
          id: 'arom',
          kind: 'start_buffer' as const,
          fluidId: 'aromatic',
          supplyMode: 'rate' as const,
          autoSupplyRate: true,
          machineId: '',
          recipeId: '',
          machineCount: 1,
          overclock: 1,
          voltageTier: 'LV',
        },
        {
          id: 'co2sink',
          kind: 'end_buffer' as const,
          fluidId: 'co2',
          machineId: '',
          recipeId: '',
          machineCount: 1,
          overclock: 1,
          voltageTier: 'LV',
        },
        {
          id: 'h2sink',
          kind: 'end_buffer' as const,
          fluidId: 'h2',
          machineId: '',
          recipeId: '',
          machineCount: 1,
          overclock: 1,
          voltageTier: 'LV',
        },
      ],
      edges: [
        { id: 'e_steam', source: 'steam', target: 'cr', sourcePort: 'out_0', targetPort: 'in_1', fluidId: 'steam' },
        { id: 'e_arom', source: 'arom', target: 'lcr', sourcePort: 'out_0', targetPort: 'in_1', fluidId: 'aromatic' },
        { id: 'e_ref', source: 'lcr', target: 'cr', sourcePort: 'out_0', targetPort: 'in_0', fluidId: 'reformed' },
        { id: 'e_off', source: 'cr', target: 'el', sourcePort: 'out_1', targetPort: 'in_0', fluidId: 'off_gas' },
        { id: 'e_rh', source: 'el', target: 'lcr', sourcePort: 'out_0', targetPort: 'in_0', itemId: 'gtceu:tiny_rhenium_dust' },
        { id: 'e_co2', source: 'el', target: 'co2sink', sourcePort: 'out_1', targetPort: 'in_0', fluidId: 'co2' },
        { id: 'e_h2', source: 'el', target: 'h2sink', sourcePort: 'out_2', targetPort: 'in_0', fluidId: 'h2' },
      ],
      preserveManualMachineCounts: true,
    });

    const analysis = analyzeCycles(
      flowResult.nodeMachineCounts
        ? [
            { id: 'lcr', machineId: 'lcr', recipeId: 'reformed', machineCount: 1, overclock: 1, voltageTier: 'HV' },
            { id: 'cr', machineId: 'cracker', recipeId: 'cracker', machineCount: 1, overclock: 1, voltageTier: 'HV' },
            { id: 'el', machineId: 'elec', recipeId: 'recycle', machineCount: 1, overclock: 1, voltageTier: 'HV' },
          ]
        : [],
      [
        { id: 'e_ref', source: 'lcr', target: 'cr', sourcePort: 'out_0', targetPort: 'in_0', fluidId: 'reformed' },
        { id: 'e_off', source: 'cr', target: 'el', sourcePort: 'out_1', targetPort: 'in_0', fluidId: 'off_gas' },
        { id: 'e_rh', source: 'el', target: 'lcr', sourcePort: 'out_0', targetPort: 'in_0', itemId: 'gtceu:tiny_rhenium_dust' },
      ],
      samplePack,
      flowResult,
      buildTagIndex(samplePack),
    );

    expect(analysis.catalystImbalances).toHaveLength(0);
  });

  it('balances chanced catalyst in items/s with reproduction above 100%', () => {
    const flowResult = solveFlows({
      pack: samplePack,
      nodes: [
        {
          id: 'lcr',
          machineId: 'lcr',
          recipeId: 'reformed',
          machineCount: 1,
          overclock: 1,
          voltageTier: 'HV',
        },
        {
          id: 'cr',
          machineId: 'cracker',
          recipeId: 'cracker',
          machineCount: 1,
          overclock: 1,
          voltageTier: 'HV',
        },
        {
          id: 'el',
          machineId: 'elec',
          recipeId: 'recycle',
          machineCount: 1,
          overclock: 1,
          voltageTier: 'HV',
        },
        {
          id: 'buf',
          kind: 'intermediate_buffer' as const,
          itemId: 'gtceu:tiny_rhenium_dust',
          machineId: '',
          recipeId: '',
          machineCount: 1,
          overclock: 1,
          voltageTier: 'LV',
          capacity: 300,
        },
        {
          id: 'steam',
          kind: 'start_buffer' as const,
          fluidId: 'steam',
          supplyMode: 'rate' as const,
          autoSupplyRate: true,
          machineId: '',
          recipeId: '',
          machineCount: 1,
          overclock: 1,
          voltageTier: 'LV',
        },
        {
          id: 'arom',
          kind: 'start_buffer' as const,
          fluidId: 'aromatic',
          supplyMode: 'rate' as const,
          autoSupplyRate: true,
          machineId: '',
          recipeId: '',
          machineCount: 1,
          overclock: 1,
          voltageTier: 'LV',
        },
        {
          id: 'co2sink',
          kind: 'end_buffer' as const,
          fluidId: 'co2',
          machineId: '',
          recipeId: '',
          machineCount: 1,
          overclock: 1,
          voltageTier: 'LV',
        },
        {
          id: 'h2sink',
          kind: 'end_buffer' as const,
          fluidId: 'h2',
          machineId: '',
          recipeId: '',
          machineCount: 1,
          overclock: 1,
          voltageTier: 'LV',
        },
      ],
      edges: [
        { id: 'e_steam', source: 'steam', target: 'cr', sourcePort: 'out_0', targetPort: 'in_1', fluidId: 'steam' },
        { id: 'e_arom', source: 'arom', target: 'lcr', sourcePort: 'out_0', targetPort: 'in_1', fluidId: 'aromatic' },
        { id: 'e_ref', source: 'lcr', target: 'cr', sourcePort: 'out_0', targetPort: 'in_0', fluidId: 'reformed' },
        { id: 'e_off', source: 'cr', target: 'el', sourcePort: 'out_1', targetPort: 'in_0', fluidId: 'off_gas' },
        { id: 'e_rh_in', source: 'el', target: 'buf', sourcePort: 'out_0', targetPort: 'in_0', itemId: 'gtceu:tiny_rhenium_dust' },
        { id: 'e_rh_out', source: 'buf', target: 'lcr', sourcePort: 'out_0', targetPort: 'in_0', itemId: 'gtceu:tiny_rhenium_dust' },
        { id: 'e_co2', source: 'el', target: 'co2sink', sourcePort: 'out_1', targetPort: 'in_0', fluidId: 'co2' },
        { id: 'e_h2', source: 'el', target: 'h2sink', sourcePort: 'out_2', targetPort: 'in_0', fluidId: 'h2' },
      ],
      preserveManualMachineCounts: true,
    });

    const analysis = analyzeCycles(
      [
        { id: 'lcr', machineId: 'lcr', recipeId: 'reformed', machineCount: 1, overclock: 1, voltageTier: 'HV' },
        { id: 'cr', machineId: 'cracker', recipeId: 'cracker', machineCount: 1, overclock: 1, voltageTier: 'HV' },
        { id: 'el', machineId: 'elec', recipeId: 'recycle', machineCount: 1, overclock: 1, voltageTier: 'HV' },
        { id: 'buf', kind: 'intermediate_buffer', itemId: 'gtceu:tiny_rhenium_dust', machineId: '', recipeId: '', machineCount: 1, overclock: 1, voltageTier: 'LV' },
      ],
      [
        { id: 'e_ref', source: 'lcr', target: 'cr', sourcePort: 'out_0', targetPort: 'in_0', fluidId: 'reformed' },
        { id: 'e_off', source: 'cr', target: 'el', sourcePort: 'out_1', targetPort: 'in_0', fluidId: 'off_gas' },
        { id: 'e_rh_in', source: 'el', target: 'buf', sourcePort: 'out_0', targetPort: 'in_0', itemId: 'gtceu:tiny_rhenium_dust' },
        { id: 'e_rh_out', source: 'buf', target: 'lcr', sourcePort: 'out_0', targetPort: 'in_0', itemId: 'gtceu:tiny_rhenium_dust' },
      ],
      samplePack,
      flowResult,
      buildTagIndex(samplePack),
    );

    const rhBalance = analysis.balances.find(
      (b) => b.productId === 'gtceu:tiny_rhenium_dust',
    );
    expect(rhBalance).toBeDefined();
    expect(rhBalance!.net.toNumber()).toBeGreaterThan(0);
    const reproduction = computeReproductionPercent(rhBalance!.produce, rhBalance!.consume);
    expect(reproduction).toBeDefined();
    expect(reproduction!).toBeGreaterThan(100);
  });
});
