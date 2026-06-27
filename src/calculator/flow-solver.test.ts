import { describe, expect, it } from 'vitest';
import { ceilMachineCount, idealMachineCount } from './rounding';
import { R } from './rational';
import { solveFlows } from './flow-solver';
import type { PackData } from '@/data/types';

const samplePack: PackData = {
  format: 'tfg-pack-data',
  formatVersion: 1,
  modpackVersion: '0.12.8-sample',
  dataVersion: 1,
  generatedAt: '2026-06-17T00:00:00Z',
  machines: [],
  items: [],
  fluids: [],
  recipes: [
    {
      id: 'r1',
      machineId: 'm1',
      durationTicks: 20,
      inputs: [{ itemId: 'ore', amount: 1 }],
      outputs: [{ itemId: 'crushed', amount: 2 }],
    },
    {
      id: 'r2',
      machineId: 'm2',
      durationTicks: 20,
      inputs: [{ itemId: 'crushed', amount: 2 }],
      outputs: [{ itemId: 'ingot', amount: 1 }],
    },
  ],
};

describe('rounding', () => {
  it('ceil minimum 1', () => {
    expect(ceilMachineCount(R.from(0.1))).toBe(1);
    expect(ceilMachineCount(R.from(1))).toBe(1);
    expect(ceilMachineCount(R.from(1.1))).toBe(2);
    expect(ceilMachineCount(R.of(3, 2))).toBe(2);
  });

  it('ideal machine count', () => {
    expect(idealMachineCount(R.from(3), R.from(2)).toNumber()).toBe(1.5);
  });
});

describe('solveFlows', () => {
  it('linear chain with target', () => {
    const result = solveFlows({
      pack: samplePack,
      nodes: [
        {
          id: 'a',
          machineId: 'm1',
          recipeId: 'r1',
          machineCount: 1,
          overclock: 1,
          voltageTier: 'LV' as const,
          parallel: 1,
        },
        {
          id: 'b',
          machineId: 'm2',
          recipeId: 'r2',
          machineCount: 1,
          overclock: 1,
          voltageTier: 'LV' as const,
          parallel: 1,
        },
      ],
      edges: [
        {
          id: 'e1',
          source: 'a',
          target: 'b',
          itemId: 'crushed',
        },
      ],
      targets: [{ nodeId: 'b', itemId: 'ingot', ratePerSecond: 2.5 }],
      preserveManualMachineCounts: false,
    });

    expect(result.nodeMachineCounts['b']).toBeGreaterThanOrEqual(3);
    expect(result.edgeFlows['e1'].toNumber()).toBeGreaterThan(0);
  });

  it('preserve mode scales input and output rates with manual machine count', () => {
    const mixerRecipe = {
      id: 'mix',
      machineId: 'mixer',
      durationTicks: 100,
      inputs: [
        { itemId: 'a', amount: 2 },
        { itemId: 'b', amount: 1 },
      ],
      outputs: [{ itemId: 'out', amount: 3 }],
    };
    const pack: PackData = { ...samplePack, recipes: [mixerRecipe] };
    const node = {
      id: 'n1',
      machineId: 'mixer',
      recipeId: 'mix',
      machineCount: 1,
      overclock: 1,
      voltageTier: 'LV' as const,
      parallel: 1,
    };

    const one = solveFlows({
      pack,
      nodes: [node],
      edges: [],
      targets: [],
      preserveManualMachineCounts: true,
    });
    const three = solveFlows({
      pack,
      nodes: [{ ...node, machineCount: 3 }],
      edges: [],
      targets: [],
      preserveManualMachineCounts: true,
    });

    const out1 = one.nodeOutputRates.n1!.out!.toNumber();
    const out3 = three.nodeOutputRates.n1!.out!.toNumber();
    const in1 = one.nodeInputRates.n1!.a!.toNumber();
    const in3 = three.nodeInputRates.n1!.a!.toNumber();

    expect(out3 / out1).toBeCloseTo(3, 5);
    expect(in3 / in1).toBeCloseTo(3, 5);
    expect(three.nodeMachineCounts.n1).toBe(3);
  });

  it('preserve mode keeps manual machine count on target nodes', () => {
    const mixerRecipe = {
      id: 'mix',
      machineId: 'mixer',
      durationTicks: 100,
      inputs: [{ itemId: 'a', amount: 1 }],
      outputs: [{ itemId: 'out', amount: 1 }],
    };
    const pack: PackData = { ...samplePack, recipes: [mixerRecipe] };
    const node = {
      id: 'n1',
      machineId: 'mixer',
      recipeId: 'mix',
      machineCount: 4,
      overclock: 1,
      voltageTier: 'LV' as const,
      parallel: 1,
    };

    const preserved = solveFlows({
      pack,
      nodes: [node],
      edges: [],
      targets: [{ nodeId: 'n1', itemId: 'out', ratePerSecond: 0.5 }],
      preserveManualMachineCounts: true,
    });
    const full = solveFlows({
      pack,
      nodes: [node],
      edges: [],
      targets: [{ nodeId: 'n1', itemId: 'out', ratePerSecond: 0.5 }],
      preserveManualMachineCounts: false,
    });

    expect(preserved.nodeMachineCounts.n1).toBe(4);
    expect(preserved.nodeOutputRates.n1!.out!.toNumber()).toBeGreaterThan(0.5);
    expect(full.nodeMachineCounts.n1).toBeLessThan(4);
  });

  it('assigns per-port output rates and edge flows for duplicate products on separate ports', () => {
    const greenhouseRecipe = {
      id: 'gh_pine',
      machineId: 'greenhouse',
      durationTicks: 12000,
      inputs: [{ itemId: 'tfc:wood/sapling/pine', amount: 8 }],
      outputs: [
        { itemId: 'tfc:wood/log/pine', amount: 64 },
        { itemId: 'tfc:wood/sapling/pine', amount: 4 },
        { itemId: 'tfc:wood/log/pine', amount: 16 },
        { itemId: 'tfc:wood/log/pine', amount: 16 },
      ],
    };
    const pyroRecipe = {
      id: 'pyro',
      machineId: 'pyro',
      durationTicks: 100,
      inputs: [{ itemId: 'tfc:wood/log/pine', amount: 1 }],
      outputs: [{ itemId: 'charcoal', amount: 1 }],
    };
    const pack: PackData = {
      ...samplePack,
      recipes: [greenhouseRecipe, pyroRecipe],
    };

    const result = solveFlows({
      pack,
      nodes: [
        {
          id: 'gh',
          machineId: 'greenhouse',
          recipeId: 'gh_pine',
          machineCount: 1,
          overclock: 1,
          voltageTier: 'LV' as const,
          parallel: 1,
        },
        {
          id: 'pyro',
          machineId: 'pyro',
          recipeId: 'pyro',
          machineCount: 1,
          overclock: 1,
          voltageTier: 'LV' as const,
          parallel: 1,
        },
      ],
      edges: [
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
      ],
      targets: [],
      preserveManualMachineCounts: true,
    });

    expect(result.nodePortOutputRates.gh!.out_0!.toNumber()).toBeCloseTo(64 / 600, 5);
    expect(result.nodePortOutputRates.gh!.out_2!.toNumber()).toBeCloseTo(16 / 600, 5);
    expect(result.nodePortOutputRates.gh!.out_3!.toNumber()).toBeCloseTo(16 / 600, 5);
    expect(result.nodeOutputRates.gh!['tfc:wood/log/pine']!.toNumber()).toBeCloseTo(
      96 / 600,
      5,
    );
    expect(result.edgeFlows.e0!.toNumber()).toBeCloseTo(64 / 600, 5);
    expect(result.edgeFlows.e2!.toNumber()).toBeCloseTo(16 / 600, 5);
    expect(result.edgeFlows.e3!.toNumber()).toBeCloseTo(16 / 600, 5);
  });

  it('applies expected output rate for chanced ports', () => {
    const recipe = {
      id: 'chanced',
      machineId: 'm',
      durationTicks: 100,
      inputs: [],
      outputs: [{ itemId: 'dust', amount: 10, chance: 2000 }],
    };
    const pack: PackData = { ...samplePack, recipes: [recipe] };
    const result = solveFlows({
      pack,
      nodes: [
        {
          id: 'n1',
          machineId: 'm',
          recipeId: 'chanced',
          machineCount: 1,
          overclock: 1,
          voltageTier: 'LV' as const,
          parallel: 1,
        },
      ],
      edges: [],
      targets: [],
      preserveManualMachineCounts: true,
    });
    expect(result.nodePortOutputRates.n1!.out_0!.toNumber()).toBeCloseTo(0.4, 5);
  });

  it('limits edge flow when downstream has more capacity than upstream', () => {
    const result = solveFlows({
      pack: samplePack,
      nodes: [
        {
          id: 'a',
          machineId: 'm1',
          recipeId: 'r1',
          machineCount: 1,
          overclock: 1,
          voltageTier: 'LV',
          parallel: 1,
        },
        {
          id: 'b',
          machineId: 'm2',
          recipeId: 'r2',
          machineCount: 3,
          overclock: 1,
          voltageTier: 'LV',
          parallel: 1,
        },
      ],
      edges: [
        {
          id: 'e1',
          source: 'a',
          target: 'b',
          sourcePort: 'out_0',
          targetPort: 'in_0',
          itemId: 'crushed',
        },
      ],
      targets: [],
      preserveManualMachineCounts: true,
    });

    const upstreamOut = result.nodePortOutputRates.a!.out_0!.toNumber();
    const edgeFlow = result.edgeFlows.e1!.toNumber();
    expect(edgeFlow).toBeCloseTo(upstreamOut, 5);
    expect(edgeFlow).toBeLessThan(
      result.nodePortOutputRates.b!.out_0!.toNumber(),
    );
    expect(result.nodePortDeficit.b!.in_0!.toNumber()).toBeGreaterThan(0);
    expect(result.nodeLoad.b!.toNumber()).toBeLessThan(1);
    expect(result.nodePortInLoad.b!.in_0!.toNumber()).toBeLessThan(1);
  });

  it('reduces effective output when a multi-input recipe lacks one ingredient', () => {
    const mixerRecipe = {
      id: 'mix',
      machineId: 'mixer',
      durationTicks: 100,
      inputs: [
        { itemId: 'a', amount: 1 },
        { itemId: 'b', amount: 1 },
      ],
      outputs: [{ itemId: 'out', amount: 1 }],
    };
    const feederRecipe = {
      id: 'feed',
      machineId: 'feed',
      durationTicks: 100,
      inputs: [],
      outputs: [{ itemId: 'a', amount: 1 }],
    };
    const pack: PackData = {
      ...samplePack,
      recipes: [mixerRecipe, feederRecipe],
    };

    const result = solveFlows({
      pack,
      nodes: [
        {
          id: 'feed',
          machineId: 'feed',
          recipeId: 'feed',
          machineCount: 1,
          overclock: 1,
          voltageTier: 'LV',
          parallel: 1,
        },
        {
          id: 'mix',
          machineId: 'mixer',
          recipeId: 'mix',
          machineCount: 1,
          overclock: 1,
          voltageTier: 'LV',
          parallel: 1,
        },
      ],
      edges: [
        {
          id: 'ea',
          source: 'feed',
          target: 'mix',
          sourcePort: 'out_0',
          targetPort: 'in_0',
          itemId: 'a',
        },
      ],
      targets: [],
      preserveManualMachineCounts: true,
    });

    expect(result.edgeFlows.ea!.toNumber()).toBeGreaterThan(0);
    expect(result.nodePortOutputRates.mix!.out_0!.toNumber()).toBeGreaterThan(0);
    expect(result.nodePortDeficit.mix!.in_1!.toNumber()).toBeGreaterThan(0);
  });

  it('shows 100% consumer load and surplus when production exceeds downstream demand', () => {
    const result = solveFlows({
      pack: samplePack,
      nodes: [
        {
          id: 'a',
          machineId: 'm1',
          recipeId: 'r1',
          machineCount: 2,
          overclock: 1,
          voltageTier: 'LV',
          parallel: 1,
        },
        {
          id: 'b',
          machineId: 'm2',
          recipeId: 'r2',
          machineCount: 1,
          overclock: 1,
          voltageTier: 'LV',
          parallel: 1,
        },
      ],
      edges: [
        {
          id: 'e1',
          source: 'a',
          target: 'b',
          sourcePort: 'out_0',
          targetPort: 'in_0',
          itemId: 'crushed',
        },
      ],
      targets: [],
      preserveManualMachineCounts: true,
    });

    const sent = result.edgeFlows.e1!.toNumber();
    const theoretical = result.nodePortOutputRates.a!.out_0!.toNumber();
    const effective = theoretical * 0.5;
    expect(theoretical).toBeGreaterThan(sent);
    expect(sent).toBeCloseTo(effective, 5);
    expect(result.nodePortOutRecipeLoad.a!.out_0!.toNumber()).toBeCloseTo(0.5, 5);
    expect(result.nodePortOutConsumerLoad.a!.out_0!.toNumber()).toBeCloseTo(1, 5);
    expect(result.nodeSurplus.a!.crushed!.toNumber()).toBeCloseTo(2, 5);
    expect(result.nodePortOutCapacityLoad.a!.out_0!.toNumber()).toBeCloseTo(1, 5);
    expect(result.nodeMaxLoad.a!.toNumber()).toBeCloseTo(0.5, 5);
  });

  it('can report different output port loads for competing producers', () => {
    const result = solveFlows({
      pack: samplePack,
      nodes: [
        {
          id: 'a',
          machineId: 'm1',
          recipeId: 'r1',
          machineCount: 2,
          overclock: 1,
          voltageTier: 'LV',
          parallel: 1,
        },
        {
          id: 'b',
          machineId: 'm1',
          recipeId: 'r1',
          machineCount: 2,
          overclock: 1,
          voltageTier: 'LV',
          parallel: 1,
        },
        {
          id: 'c',
          machineId: 'm2',
          recipeId: 'r2',
          machineCount: 1,
          overclock: 1,
          voltageTier: 'LV',
          parallel: 1,
        },
      ],
      edges: [
        {
          id: 'e1',
          source: 'a',
          target: 'c',
          sourcePort: 'out_0',
          targetPort: 'in_0',
          itemId: 'crushed',
        },
        {
          id: 'e2',
          source: 'b',
          target: 'c',
          sourcePort: 'out_0',
          targetPort: 'in_0',
          itemId: 'crushed',
        },
      ],
      targets: [],
      preserveManualMachineCounts: true,
    });

    const inA = result.nodePortInLoad.a!.in_0!.toNumber();
    const inB = result.nodePortInLoad.b!.in_0!.toNumber();
    const outA = result.nodePortOutLoad.a!.out_0!.toNumber();
    const outB = result.nodePortOutLoad.b!.out_0!.toNumber();
    expect(inA).toBeCloseTo(inB, 5);
    expect(outA).not.toBeCloseTo(outB, 3);
  });

  it('converges flows on a cyclic graph with an external source', () => {
    const sourceRecipe = {
      id: 'src',
      machineId: 'm',
      durationTicks: 20,
      inputs: [],
      outputs: [{ itemId: 'x', amount: 2 }],
    };
    const passRecipe = {
      id: 'pass',
      machineId: 'm',
      durationTicks: 20,
      inputs: [{ itemId: 'x', amount: 1 }],
      outputs: [{ itemId: 'x', amount: 1 }],
    };
    const pack: PackData = { ...samplePack, recipes: [sourceRecipe, passRecipe] };

    const result = solveFlows({
      pack,
      nodes: [
        {
          id: 'src',
          machineId: 'm',
          recipeId: 'src',
          machineCount: 1,
          overclock: 1,
          voltageTier: 'LV',
          parallel: 1,
        },
        {
          id: 'loop',
          machineId: 'm',
          recipeId: 'pass',
          machineCount: 1,
          overclock: 1,
          voltageTier: 'LV',
          parallel: 1,
        },
      ],
      edges: [
        {
          id: 'e1',
          source: 'src',
          target: 'loop',
          sourcePort: 'out_0',
          targetPort: 'in_0',
          itemId: 'x',
        },
        {
          id: 'e2',
          source: 'loop',
          target: 'loop',
          sourcePort: 'out_0',
          targetPort: 'in_0',
          itemId: 'x',
        },
      ],
      targets: [],
      preserveManualMachineCounts: true,
    });

    expect(result.edgeFlows.e2!.toNumber()).toBeGreaterThan(0);
    expect(result.edgeFlows.e1!.toNumber()).toBeGreaterThanOrEqual(0);
    expect(
      result.edgeFlows.e1!.add(result.edgeFlows.e2!).toNumber(),
    ).toBeGreaterThan(0);
    expect(result.nodeLoad.loop!.toNumber()).toBeCloseTo(1, 5);
    expect(result.nodeCurrentLoad.loop!.toNumber()).toBeCloseTo(1, 5);
  });

  it('separates max, recipe, and capacity load for input-limited multi-output machine', () => {
    const electrolyzerRecipe = {
      id: 'electrolyze',
      machineId: 'electrolyzer',
      durationTicks: 90,
      inputs: [{ fluidId: 'gas', amount: 1000 }],
      outputs: [
        { itemId: 'dust', amount: 1 },
        { fluidId: 'co2', amount: 500 },
        { fluidId: 'h2', amount: 500 },
      ],
    };
    const producerRecipe = {
      id: 'gas',
      machineId: 'producer',
      durationTicks: 20,
      inputs: [],
      outputs: [{ fluidId: 'gas', amount: 10 }],
    };
    const sinkRecipe = {
      id: 'sink',
      machineId: 'sink',
      durationTicks: 20,
      inputs: [{ fluidId: 'fluid', amount: 1 }],
      outputs: [{ itemId: 'ingot', amount: 1 }],
    };
    const pack: PackData = {
      ...samplePack,
      recipes: [producerRecipe, electrolyzerRecipe, sinkRecipe],
    };
    const result = solveFlows({
      pack,
      nodes: [
        {
          id: 'prod',
          machineId: 'producer',
          recipeId: 'gas',
          machineCount: 1,
          overclock: 1,
          voltageTier: 'LV',
          parallel: 1,
        },
        {
          id: 'elec',
          machineId: 'electrolyzer',
          recipeId: 'electrolyze',
          machineCount: 1,
          overclock: 1,
          voltageTier: 'HV',
          parallel: 1,
        },
        {
          id: 'co2sink',
          machineId: 'sink',
          recipeId: 'sink',
          machineCount: 100,
          overclock: 1,
          voltageTier: 'LV',
          parallel: 1,
        },
        {
          id: 'h2sink',
          machineId: 'sink',
          recipeId: 'sink',
          machineCount: 100,
          overclock: 1,
          voltageTier: 'LV',
          parallel: 1,
        },
        {
          id: 'dustsink',
          machineId: 'sink',
          recipeId: 'sink',
          machineCount: 100,
          overclock: 1,
          voltageTier: 'LV',
          parallel: 1,
        },
      ],
      edges: [
        {
          id: 'e_gas',
          source: 'prod',
          target: 'elec',
          sourcePort: 'out_0',
          targetPort: 'in_0',
          fluidId: 'gas',
        },
        {
          id: 'e_dust',
          source: 'elec',
          target: 'dustsink',
          sourcePort: 'out_0',
          targetPort: 'in_0',
          itemId: 'dust',
        },
        {
          id: 'e_co2',
          source: 'elec',
          target: 'co2sink',
          sourcePort: 'out_1',
          targetPort: 'in_0',
          fluidId: 'co2',
        },
        {
          id: 'e_h2',
          source: 'elec',
          target: 'h2sink',
          sourcePort: 'out_2',
          targetPort: 'in_0',
          fluidId: 'h2',
        },
      ],
      targets: [],
      preserveManualMachineCounts: true,
    });

    const gasDemand = 1000 / (90 / 20);
    const gasSupply = 10 / 1;
    const expectedMax = gasSupply / gasDemand;

    expect(result.nodeMaxLoad.elec!.toNumber()).toBeCloseTo(expectedMax, 3);
    expect(result.nodePortOutRecipeLoad.elec!.out_1!.toNumber()).toBeCloseTo(
      expectedMax,
      3,
    );
    expect(result.nodePortOutConsumerLoad.elec!.out_1!.toNumber()).toBeLessThan(1);
    expect(result.nodePortOutCapacityLoad.elec!.out_1!.toNumber()).toBeCloseTo(1, 4);
    expect(result.nodePortOutCapacityLoad.elec!.out_2!.toNumber()).toBeCloseTo(1, 4);
    expect(result.nodeCurrentLoad.elec!.toNumber()).toBeCloseTo(1, 4);
  });

  it('ignores open output ports when computing current load', () => {
    const distillRecipe = {
      id: 'distill',
      machineId: 'tower',
      durationTicks: 20,
      inputs: [{ fluidId: 'tar', amount: 100 }],
      outputs: [
        { fluidId: 'benzene', amount: 50 },
        { fluidId: 'toluene', amount: 50 },
      ],
    };
    const producerRecipe = {
      id: 'tar',
      machineId: 'producer',
      durationTicks: 20,
      inputs: [],
      outputs: [{ fluidId: 'tar', amount: 100 }],
    };
    const consumerRecipe = {
      id: 'use',
      machineId: 'consumer',
      durationTicks: 20,
      inputs: [{ fluidId: 'benzene', amount: 50 }],
      outputs: [{ itemId: 'out', amount: 1 }],
    };
    const pack: PackData = {
      ...samplePack,
      recipes: [producerRecipe, distillRecipe, consumerRecipe],
    };
    const result = solveFlows({
      pack,
      nodes: [
        {
          id: 'prod',
          machineId: 'producer',
          recipeId: 'tar',
          machineCount: 1,
          overclock: 1,
          voltageTier: 'LV',
          parallel: 1,
        },
        {
          id: 'distill',
          machineId: 'tower',
          recipeId: 'distill',
          machineCount: 1,
          overclock: 1,
          voltageTier: 'LV',
          parallel: 1,
        },
        {
          id: 'cons',
          machineId: 'consumer',
          recipeId: 'use',
          machineCount: 1,
          overclock: 1,
          voltageTier: 'LV',
          parallel: 1,
        },
      ],
      edges: [
        {
          id: 'e_tar',
          source: 'prod',
          target: 'distill',
          sourcePort: 'out_0',
          targetPort: 'in_0',
          fluidId: 'tar',
        },
        {
          id: 'e_benzene',
          source: 'distill',
          target: 'cons',
          sourcePort: 'out_0',
          targetPort: 'in_0',
          fluidId: 'benzene',
        },
      ],
      targets: [],
      preserveManualMachineCounts: true,
    });

    expect(result.nodeMaxLoad.distill!.toNumber()).toBeCloseTo(1, 4);
    expect(result.nodeCurrentLoad.distill!.toNumber()).toBeCloseTo(1, 4);
    expect(result.nodePortOutRecipeLoad.distill!.out_1).toBeUndefined();
  });

  it('output bottleneck couples all outputs proportionally', () => {
    const electrolyzerRecipe = {
      id: 'electrolyze',
      machineId: 'electrolyzer',
      durationTicks: 90,
      inputs: [{ fluidId: 'gas', amount: 1000 }],
      outputs: [
        { itemId: 'dust', amount: 1 },
        { fluidId: 'co2', amount: 500 },
        { fluidId: 'h2', amount: 500 },
      ],
    };
    const producerRecipe = {
      id: 'gas',
      machineId: 'producer',
      durationTicks: 20,
      inputs: [],
      outputs: [{ fluidId: 'gas', amount: 1000 }],
    };
    const sinkRecipe = {
      id: 'sink',
      machineId: 'sink',
      durationTicks: 20,
      inputs: [{ fluidId: 'fluid', amount: 1 }],
      outputs: [{ itemId: 'ingot', amount: 1 }],
    };
    const pack: PackData = {
      ...samplePack,
      recipes: [producerRecipe, electrolyzerRecipe, sinkRecipe],
    };
    const result = solveFlows({
      pack,
      nodes: [
        {
          id: 'prod',
          machineId: 'producer',
          recipeId: 'gas',
          machineCount: 10,
          overclock: 1,
          voltageTier: 'LV',
          parallel: 1,
        },
        {
          id: 'elec',
          machineId: 'electrolyzer',
          recipeId: 'electrolyze',
          machineCount: 1,
          overclock: 1,
          voltageTier: 'HV',
          parallel: 1,
        },
        {
          id: 'co2sink',
          machineId: 'sink',
          recipeId: 'sink',
          machineCount: 100,
          overclock: 1,
          voltageTier: 'LV',
          parallel: 1,
        },
        {
          id: 'h2sink',
          machineId: 'sink',
          recipeId: 'sink',
          machineCount: 1,
          overclock: 1,
          voltageTier: 'LV',
          parallel: 1,
        },
        {
          id: 'dustsink',
          machineId: 'sink',
          recipeId: 'sink',
          machineCount: 100,
          overclock: 1,
          voltageTier: 'LV',
          parallel: 1,
        },
      ],
      edges: [
        {
          id: 'e_gas',
          source: 'prod',
          target: 'elec',
          sourcePort: 'out_0',
          targetPort: 'in_0',
          fluidId: 'gas',
        },
        {
          id: 'e_dust',
          source: 'elec',
          target: 'dustsink',
          sourcePort: 'out_0',
          targetPort: 'in_0',
          itemId: 'dust',
        },
        {
          id: 'e_co2',
          source: 'elec',
          target: 'co2sink',
          sourcePort: 'out_1',
          targetPort: 'in_0',
          fluidId: 'co2',
        },
        {
          id: 'e_h2',
          source: 'elec',
          target: 'h2sink',
          sourcePort: 'out_2',
          targetPort: 'in_0',
          fluidId: 'h2',
        },
      ],
      targets: [],
      preserveManualMachineCounts: true,
    });

    const theo = result.nodePortOutputRates.elec!;
    const ratio = (port: string) =>
      result.edgeFlows[
        port === 'out_0' ? 'e_dust' : port === 'out_1' ? 'e_co2' : 'e_h2'
      ]!.toNumber() / theo[port]!.toNumber();

    const r0 = ratio('out_0');
    const r1 = ratio('out_1');
    const r2 = ratio('out_2');
    expect(r0).toBeCloseTo(r1, 4);
    expect(r1).toBeCloseTo(r2, 4);
    expect(r2).toBeLessThan(1);
    expect(result.nodePortOutRecipeLoad.elec!.out_0!.toNumber()).toBeCloseTo(
      result.nodePortOutRecipeLoad.elec!.out_1!.toNumber(),
      4,
    );
    expect(result.nodePortOutRecipeLoad.elec!.out_1!.toNumber()).toBeCloseTo(
      result.nodePortOutRecipeLoad.elec!.out_2!.toNumber(),
      4,
    );
    expect(result.nodeSurplus.elec!.dust).toBeUndefined();
    expect(result.nodeSurplus.elec!.co2).toBeUndefined();
    expect(result.nodePortOutConsumerLoad.elec!.out_2!.toNumber()).toBeCloseTo(1, 4);
    expect(result.nodePortOutConsumerLoad.elec!.out_1!.toNumber()).toBeLessThan(1);
  });

  it('output bottleneck uses chanced theoretical rates on primary port', () => {
    const chancedRecipe = {
      id: 'chanced',
      machineId: 'proc',
      durationTicks: 20,
      inputs: [{ fluidId: 'gas', amount: 100 }],
      outputs: [
        { itemId: 'dust', amount: 10, chance: 2000 },
        { fluidId: 'h2', amount: 50 },
      ],
    };
    const producerRecipe = {
      id: 'gas',
      machineId: 'producer',
      durationTicks: 20,
      inputs: [],
      outputs: [{ fluidId: 'gas', amount: 1000 }],
    };
    const sinkRecipe = {
      id: 'sink',
      machineId: 'sink',
      durationTicks: 20,
      inputs: [{ fluidId: 'fluid', amount: 1 }],
      outputs: [{ itemId: 'ingot', amount: 1 }],
    };
    const pack: PackData = {
      ...samplePack,
      recipes: [producerRecipe, chancedRecipe, sinkRecipe],
    };
    const result = solveFlows({
      pack,
      nodes: [
        {
          id: 'prod',
          machineId: 'producer',
          recipeId: 'gas',
          machineCount: 10,
          overclock: 1,
          voltageTier: 'LV',
          parallel: 1,
        },
        {
          id: 'proc',
          machineId: 'proc',
          recipeId: 'chanced',
          machineCount: 1,
          overclock: 1,
          voltageTier: 'LV',
          parallel: 1,
        },
        {
          id: 'h2sink',
          machineId: 'sink',
          recipeId: 'sink',
          machineCount: 1,
          overclock: 1,
          voltageTier: 'LV',
          parallel: 1,
        },
        {
          id: 'dustsink',
          machineId: 'sink',
          recipeId: 'sink',
          machineCount: 100,
          overclock: 1,
          voltageTier: 'LV',
          parallel: 1,
        },
      ],
      edges: [
        {
          id: 'e_gas',
          source: 'prod',
          target: 'proc',
          sourcePort: 'out_0',
          targetPort: 'in_0',
          fluidId: 'gas',
        },
        {
          id: 'e_dust',
          source: 'proc',
          target: 'dustsink',
          sourcePort: 'out_0',
          targetPort: 'in_0',
          itemId: 'dust',
        },
        {
          id: 'e_h2',
          source: 'proc',
          target: 'h2sink',
          sourcePort: 'out_1',
          targetPort: 'in_0',
          fluidId: 'h2',
        },
      ],
      targets: [],
      preserveManualMachineCounts: true,
    });

    const theo = result.nodePortOutputRates.proc!;
    const dustRatio =
      result.edgeFlows.e_dust!.toNumber() / theo.out_0!.toNumber();
    const h2Ratio = result.edgeFlows.e_h2!.toNumber() / theo.out_1!.toNumber();
    expect(dustRatio).toBeCloseTo(h2Ratio, 4);
    expect(h2Ratio).toBeLessThan(1);
  });

  it('shows surplus when consumers are satisfied but production exceeds sent', () => {
    const result = solveFlows({
      pack: samplePack,
      nodes: [
        {
          id: 'a',
          machineId: 'm1',
          recipeId: 'r1',
          machineCount: 2,
          overclock: 1,
          voltageTier: 'LV',
          parallel: 1,
        },
        {
          id: 'b',
          machineId: 'm2',
          recipeId: 'r2',
          machineCount: 1,
          overclock: 1,
          voltageTier: 'LV',
          parallel: 1,
        },
      ],
      edges: [
        {
          id: 'e1',
          source: 'a',
          target: 'b',
          sourcePort: 'out_0',
          targetPort: 'in_0',
          itemId: 'crushed',
        },
      ],
      targets: [],
      preserveManualMachineCounts: true,
    });

    expect(result.nodePortOutConsumerLoad.a!.out_0!.toNumber()).toBeCloseTo(1, 5);
    expect(result.nodeSurplus.a!.crushed!.toNumber()).toBeGreaterThan(0);
  });

  it('untitled8_like_electrolyzer_output_bottleneck', () => {
    const electrolyzerRecipe = {
      id: 'tfg:cracker_off_gas_recycling',
      machineId: 'gtceu:electrolyzer',
      durationTicks: 90,
      inputs: [{ fluidId: 'tfg:cracker_off_gas', amount: 1000 }],
      outputs: [
        { itemId: 'gtceu:tiny_rhenium_dust', amount: 1, chance: 1000 },
        { fluidId: 'gtceu:carbon_dioxide', amount: 500 },
        { fluidId: 'gtceu:hydrogen', amount: 500 },
      ],
    };
    const gasRecipe = {
      id: 'gas',
      machineId: 'producer',
      durationTicks: 20,
      inputs: [],
      outputs: [{ fluidId: 'tfg:cracker_off_gas', amount: 10000 }],
    };
    const towerRecipe = {
      id: 'tfg:raw_aromatic_mix_bituminous_hydrogen',
      machineId: 'gtceu:coal_liquefaction_tower',
      durationTicks: 640,
      inputs: [
        { fluidId: 'gtceu:hydrogen', amount: 100 },
        { fluidId: 'gtceu:creosote', amount: 4000 },
        { itemId: 'tfc:ore/bituminous_coal', amount: 10 },
      ],
      outputs: [{ fluidId: 'gtceu:coal_tar', amount: 1000 }],
    };
    const sinkRecipe = {
      id: 'sink',
      machineId: 'sink',
      durationTicks: 20,
      inputs: [{ fluidId: 'fluid', amount: 1 }],
      outputs: [{ itemId: 'ingot', amount: 1 }],
    };
    const itemSinkRecipe = {
      id: 'itemsink',
      machineId: 'itemsink',
      durationTicks: 20,
      inputs: [{ itemId: 'item', amount: 1 }],
      outputs: [{ itemId: 'out', amount: 1 }],
    };
    const pack: PackData = {
      ...samplePack,
      recipes: [
        gasRecipe,
        electrolyzerRecipe,
        towerRecipe,
        sinkRecipe,
        itemSinkRecipe,
      ],
    };
    const result = solveFlows({
      pack,
      nodes: [
        {
          id: 'prod',
          machineId: 'producer',
          recipeId: 'gas',
          machineCount: 10,
          overclock: 1,
          voltageTier: 'LV',
          parallel: 1,
        },
        {
          id: 'elec',
          machineId: 'gtceu:electrolyzer',
          recipeId: 'tfg:cracker_off_gas_recycling',
          machineCount: 1,
          overclock: 1,
          voltageTier: 'HV',
          parallel: 1,
        },
        {
          id: 'tower',
          machineId: 'gtceu:coal_liquefaction_tower',
          recipeId: 'tfg:raw_aromatic_mix_bituminous_hydrogen',
          machineCount: 84,
          overclock: 1,
          voltageTier: 'LV',
          parallel: 1,
        },
        {
          id: 'co2sink',
          machineId: 'sink',
          recipeId: 'sink',
          machineCount: 100,
          overclock: 1,
          voltageTier: 'LV',
          parallel: 1,
        },
        {
          id: 'resink',
          machineId: 'itemsink',
          recipeId: 'itemsink',
          machineCount: 100,
          overclock: 1,
          voltageTier: 'LV',
          parallel: 1,
        },
      ],
      edges: [
        {
          id: 'e_gas',
          source: 'prod',
          target: 'elec',
          sourcePort: 'out_0',
          targetPort: 'in_0',
          fluidId: 'tfg:cracker_off_gas',
        },
        {
          id: 'e_re',
          source: 'elec',
          target: 'resink',
          sourcePort: 'out_0',
          targetPort: 'in_0',
          itemId: 'gtceu:tiny_rhenium_dust',
        },
        {
          id: 'e_co2',
          source: 'elec',
          target: 'co2sink',
          sourcePort: 'out_1',
          targetPort: 'in_0',
          fluidId: 'gtceu:carbon_dioxide',
        },
        {
          id: 'e_h2',
          source: 'elec',
          target: 'tower',
          sourcePort: 'out_2',
          targetPort: 'in_0',
          fluidId: 'gtceu:hydrogen',
        },
      ],
      targets: [],
      preserveManualMachineCounts: true,
    });

    const theo = result.nodePortOutputRates.elec!;
    const ratio = (port: string, edgeId: string) =>
      result.edgeFlows[edgeId]!.toNumber() / theo[port]!.toNumber();

    const rRe = ratio('out_0', 'e_re');
    const rCo2 = ratio('out_1', 'e_co2');
    const rH2 = ratio('out_2', 'e_h2');

    expect(rH2).toBeLessThan(1);
    expect(rRe).toBeCloseTo(rCo2, 4);
    expect(rCo2).toBeCloseTo(rH2, 4);
    expect(result.nodePortOutRecipeLoad.elec!.out_0!.toNumber()).toBeCloseTo(
      result.nodePortOutRecipeLoad.elec!.out_1!.toNumber(),
      4,
    );
    expect(result.nodePortOutConsumerLoad.elec!.out_2!.toNumber()).toBeLessThan(1);
    expect(result.nodePortOutConsumerLoad.elec!.out_1!.toNumber()).toBeCloseTo(1, 4);
    expect(result.nodeSurplus.elec?.['gtceu:carbon_dioxide']!.toNumber()).toBeGreaterThan(0);
    expect(result.nodeSurplus.elec?.['gtceu:tiny_rhenium_dust']).toBeUndefined();
  });
});
