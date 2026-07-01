import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PackData } from '@/data/types';
import type { TfgpFile } from '@/schema/tfgp';
import { parseTfgp } from '@/schema/tfgp';
import { loadTestPack } from '@/test-fixtures/load-test-pack';
import { runSolver } from '@/lib/scheme-solver';
import { checkScheme } from './check-scheme';

const miniPack: PackData = {
  format: 'tfg-pack-data',
  formatVersion: 1,
  modpackVersion: 'test',
  dataVersion: 1,
  generatedAt: '2026-06-28T00:00:00Z',
  machines: [],
  items: [{ id: 'charcoal', names: { ru: 'Уголь', en: 'Charcoal' } }],
  fluids: [],
  recipes: [
    {
      id: 'pyro',
      machineId: 'pyrolyse',
      durationTicks: 100,
      inputs: [{ itemId: 'log', amount: 1 }],
      outputs: [{ itemId: 'charcoal', amount: 1 }],
    },
    {
      id: 'tower',
      machineId: 'tower',
      durationTicks: 100,
      inputs: [
        { itemId: 'charcoal', amount: 2 },
        { itemId: 'creosote', amount: 1 },
      ],
      outputs: [{ itemId: 'tar', amount: 1 }],
    },
  ],
};

function scheme(overrides: Partial<TfgpFile>): TfgpFile {
  return {
    format: 'tfg-planner-graph',
    formatVersion: 1,
    meta: {
      name: 'test',
      author: '',
      createdAt: '',
      updatedAt: '',
      description: '',
    },
    modpack: { version: 'test', dataVersion: 1 },
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [],
    edges: [],
    groups: [],
    targets: [],
    ...overrides,
  };
}

const AROMATIC_WIRING_FIXTURE = path.join(
  process.cwd(),
  'src/scheme-check/fixtures/aromatic-chain-wiring-issues.tfgp',
);

describe('checkScheme', () => {
  it('flags invalid target port that zeroes upstream output', () => {
    const file = scheme({
      nodes: [
        {
          id: 'pyro',
          machineId: 'pyrolyse',
          recipeId: 'pyro',
          machineCount: 1,
          overclock: 1,
          parallel: 1,
          voltageTier: 'LV',
          position: { x: 0, y: 0 },
        },
        {
          id: 'tower',
          machineId: 'tower',
          recipeId: 'tower',
          machineCount: 1,
          overclock: 1,
          parallel: 1,
          voltageTier: 'LV',
          position: { x: 100, y: 0 },
        },
      ],
      edges: [
        {
          id: 'e_bad',
          source: 'pyro',
          target: 'tower',
          sourcePort: 'out_0',
          targetPort: 'in_2',
          itemId: 'charcoal',
        },
        {
          id: 'e_ok',
          source: 'pyro',
          target: 'tower',
          sourcePort: 'out_0',
          targetPort: 'in_0',
          itemId: 'charcoal',
        },
      ],
    });

    const result = checkScheme(file, miniPack);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === 'invalid_target_port' && i.edgeId === 'e_bad')).toBe(
      true,
    );
  });

  it('reports disconnected recipe inputs', () => {
    const file = scheme({
      nodes: [
        {
          id: 'tower',
          machineId: 'tower',
          recipeId: 'tower',
          machineCount: 1,
          overclock: 1,
          parallel: 1,
          voltageTier: 'LV',
          position: { x: 0, y: 0 },
        },
      ],
      edges: [],
    });

    const result = checkScheme(file, miniPack);
    expect(result.issues.some((i) => i.code === 'disconnected_input')).toBe(true);
  });

  it(
    'checks aromatic-chain fixture for known wiring issues',
    () => {
    const raw = readFileSync(AROMATIC_WIRING_FIXTURE, 'utf8');
    const file = parseTfgp(raw);
    const pack = loadTestPack(file.modpack.version);
    const snap = {
      nodes: file.nodes,
      edges: file.edges,
      targets: file.targets,
      viewport: file.viewport,
    };
    const flowResult = runSolver(snap, pack, { preserveManualMachineCounts: true });
    const result = checkScheme(file, pack, { flowResult });
    const invalidCharcoal = result.issues.filter(
      (i) => i.code === 'invalid_target_port' && i.edgeId === 'edge_85',
    );
    expect(invalidCharcoal.length).toBe(1);
    expect(result.issues.some((i) => i.code === 'disconnected_input' && i.nodeId === 'node_49')).toBe(
      true,
    );
  }, 30_000);

  const tagPack: PackData = {
    format: 'tfg-pack-data',
    formatVersion: 1,
    modpackVersion: 'tag-test',
    dataVersion: 1,
    generatedAt: '2026-06-28T00:00:00Z',
    machines: [],
    items: [
      { id: 'gtceu:copper_dust', names: { ru: 'x', en: 'x' } },
      { id: 'tfc:wood/log/oak', names: { ru: 'x', en: 'x' } },
      { id: '#forge:dusts/copper', names: { ru: 'x', en: 'x' } },
      { id: '#minecraft:logs_that_burn', names: { ru: 'x', en: 'x' } },
      { id: '#forge:air', names: { ru: 'x', en: 'x' } },
    ],
    fluids: [
      { id: 'gtceu:air', names: { ru: 'x', en: 'x' } },
      { id: 'gtceu:steam', names: { ru: 'x', en: 'x' } },
    ],
    recipes: [
      {
        id: 'producer_air',
        machineId: 'air_collector',
        durationTicks: 100,
        inputs: [],
        outputs: [{ fluidId: 'gtceu:air', amount: 1000 }],
      },
      {
        id: 'consumer_air',
        machineId: 'air_user',
        durationTicks: 100,
        inputs: [{ fluidId: '#forge:air', amount: 1000 }],
        outputs: [{ itemId: 'gtceu:copper_dust', amount: 1 }],
      },
      {
        id: 'producer_log',
        machineId: 'log_source',
        durationTicks: 100,
        inputs: [],
        outputs: [{ itemId: 'tfc:wood/log/oak', amount: 1 }],
      },
      {
        id: 'consumer_log',
        machineId: 'log_burner',
        durationTicks: 100,
        inputs: [{ itemId: '#minecraft:logs_that_burn', amount: 16 }],
        outputs: [{ itemId: 'charcoal', amount: 1 }],
      },
      {
        id: 'producer_dust',
        machineId: 'dust_source',
        durationTicks: 100,
        inputs: [],
        outputs: [{ itemId: 'gtceu:copper_dust', amount: 1 }],
      },
      {
        id: 'consumer_dust',
        machineId: 'dust_user',
        durationTicks: 100,
        inputs: [{ itemId: '#forge:dusts/copper', amount: 1 }],
        outputs: [{ itemId: 'tfc:wood/log/oak', amount: 1 }],
      },
      {
        id: 'producer_steam',
        machineId: 'steam_source',
        durationTicks: 100,
        inputs: [],
        outputs: [{ fluidId: 'gtceu:steam', amount: 1000 }],
      },
    ],
  };

  function tagEdgeScheme(
    producerRecipeId: string,
    consumerRecipeId: string,
    edgeProduct: { itemId?: string; fluidId?: string },
  ): TfgpFile {
    return scheme({
      nodes: [
        {
          id: 'prod',
          machineId: 'producer',
          recipeId: producerRecipeId,
          machineCount: 1,
          overclock: 1,
          parallel: 1,
          voltageTier: 'LV',
          position: { x: 0, y: 0 },
        },
        {
          id: 'cons',
          machineId: 'consumer',
          recipeId: consumerRecipeId,
          machineCount: 1,
          overclock: 1,
          parallel: 1,
          voltageTier: 'LV',
          position: { x: 100, y: 0 },
        },
      ],
      edges: [
        {
          id: 'e_tag',
          source: 'prod',
          target: 'cons',
          sourcePort: 'out_0',
          targetPort: 'in_0',
          ...edgeProduct,
        },
      ],
    });
  }

  it.each([
    {
      label: 'forge air fluid tag',
      producerRecipeId: 'producer_air',
      consumerRecipeId: 'consumer_air',
      edgeProduct: { fluidId: '#forge:air' as const },
    },
    {
      label: 'minecraft burnable logs tag',
      producerRecipeId: 'producer_log',
      consumerRecipeId: 'consumer_log',
      edgeProduct: { itemId: '#minecraft:logs_that_burn' as const },
    },
    {
      label: 'forge copper dust tag',
      producerRecipeId: 'producer_dust',
      consumerRecipeId: 'consumer_dust',
      edgeProduct: { itemId: '#forge:dusts/copper' as const },
    },
  ])('accepts tag on edge when recipe output is concrete ($label)', ({
    producerRecipeId,
    consumerRecipeId,
    edgeProduct,
  }) => {
    const file = tagEdgeScheme(producerRecipeId, consumerRecipeId, edgeProduct);
    const result = checkScheme(file, tagPack);
    expect(result.issues.some((i) => i.code === 'edge_source_product_mismatch')).toBe(false);
    expect(result.issues.some((i) => i.code === 'product_mismatch')).toBe(false);
  });

  it('flags edge_source_product_mismatch for incompatible tag and concrete output', () => {
    const file = tagEdgeScheme('producer_steam', 'consumer_air', { fluidId: '#forge:air' });
    const result = checkScheme(file, tagPack);
    expect(result.ok).toBe(false);
    expect(
      result.issues.some((i) => i.code === 'edge_source_product_mismatch' && i.edgeId === 'e_tag'),
    ).toBe(true);
  });
});
