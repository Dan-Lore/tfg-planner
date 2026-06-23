import { describe, expect, it } from 'vitest';
import type { MachineNodeData } from '@/canvas/MachineNode';
import {
  buildMachineNodeLayoutWidths,
  estimateMachineNodeLayoutWidth,
} from '@/canvas/machine-node-layout';
import type { PackData } from '@/data/types';

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
      id: 'short',
      machineId: 'mixer',
      durationTicks: 100,
      inputs: [{ itemId: 'a', amount: 1 }],
      outputs: [{ itemId: 'out', amount: 1 }],
    },
    {
      id: 'long',
      machineId: 'mixer',
      durationTicks: 100,
      inputs: [
        { itemId: 'very_long_ingredient_name_alpha', amount: 1 },
        { itemId: 'b', amount: 1 },
      ],
      outputs: [{ itemId: 'out', amount: 1 }],
    },
    {
      id: 'furnace',
      machineId: 'furnace',
      durationTicks: 100,
      inputs: [{ itemId: 'ore', amount: 1 }],
      outputs: [{ itemId: 'ingot', amount: 1 }],
    },
  ],
};

function stubData(
  overrides: Partial<MachineNodeData> & Pick<MachineNodeData, 'machineId' | 'recipeId'>,
): MachineNodeData {
  return {
    machineCount: 1,
    overclock: 1,
    parallel: 1,
    voltageTier: 'LV',
    pack,
    onRecipeChange: () => {},
    onMachineCountChange: () => {},
    onOverclockChange: () => {},
    onVoltageTierChange: () => {},
    onPortContextMenu: () => {},
    inputPorts: [],
    outputPorts: [],
    balanceLines: [],
    ...overrides,
  };
}

describe('estimateMachineNodeLayoutWidth', () => {
  it('grows with longer port labels', () => {
    const narrow = estimateMachineNodeLayoutWidth(
      stubData({
        machineId: 'mixer',
        recipeId: 'short',
        inputPorts: [{ portId: 'in_0', label: 'a', connected: false }],
        outputPorts: [{ portId: 'out_0', label: 'out', connected: false }],
      }),
    );
    const wide = estimateMachineNodeLayoutWidth(
      stubData({
        machineId: 'mixer',
        recipeId: 'long',
        inputPorts: [
          {
            portId: 'in_0',
            label: 'very_long_ingredient_name_alpha',
            rate: '12.34/s',
            connected: false,
          },
          { portId: 'in_1', label: 'b', rate: '6.00/s', connected: false },
        ],
        outputPorts: [{ portId: 'out_0', label: 'out', rate: '3.00/s', connected: false }],
      }),
    );
    expect(wide).toBeGreaterThan(narrow);
  });
});

describe('buildMachineNodeLayoutWidths', () => {
  it('assigns the same width to all nodes of one machine type', () => {
    const widths = buildMachineNodeLayoutWidths({
      nodes: [
        {
          id: 'm1',
          machineId: 'mixer',
          recipeId: 'short',
          position: { x: 0, y: 0 },
          machineCount: 1,
          overclock: 1,
          parallel: 1,
          voltageTier: 'LV',
        },
        {
          id: 'm2',
          machineId: 'mixer',
          recipeId: 'long',
          position: { x: 200, y: 0 },
          machineCount: 1,
          overclock: 1,
          parallel: 1,
          voltageTier: 'LV',
        },
        {
          id: 'f1',
          machineId: 'furnace',
          recipeId: 'furnace',
          position: { x: 0, y: 200 },
          machineCount: 1,
          overclock: 1,
          parallel: 1,
          voltageTier: 'LV',
        },
      ],
      pack,
      lang: 'en',
      connectedIn: new Map(),
      connectedOut: new Map(),
      t: ((key: string, opts?: { count?: number; value?: string | number }) => {
        if (key === 'editor.machinesMeta') return `${opts?.count}×`;
        if (key === 'editor.overclockMeta') return `OC ${opts?.value}`;
        if (key === 'editor.tierMeta') return String(opts?.value);
        return key;
      }) as never,
    });

    expect(widths.m1).toBe(widths.m2);
    expect(widths.m1).toBeGreaterThan(widths.f1!);
  });
});
