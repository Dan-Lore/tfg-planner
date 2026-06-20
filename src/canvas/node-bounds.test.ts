import { describe, expect, it } from 'vitest';
import type { MachineNodeData } from '@/canvas/MachineNode';
import {
  estimateMachineNodeHeight,
  estimateMachineNodeHeightFromPorts,
  getMachineNodeRect,
  PORT_ROW_HEIGHT,
} from '@/canvas/node-bounds';
import type { PackData } from '@/data/types';

const pack = {
  recipes: [{ id: 'r1', machineId: 'gtceu:distillery', inputs: [], outputs: [], durationTicks: 1 }],
  machines: [],
  items: {},
  fluids: {},
  lang: { items: {}, fluids: {}, machines: {}, tags: {} },
  modpackVersion: '0.12.8',
} as unknown as PackData;

function nodeData(portCount: number, withPicker = true): MachineNodeData {
  const inputs = Array.from({ length: portCount }, (_, i) => ({
    portId: `in_${i}`,
    label: 'in',
    connected: false,
  }));
  const outputs = Array.from({ length: portCount }, (_, i) => ({
    portId: `out_${i}`,
    label: 'out',
    connected: false,
  }));
  return {
    machineId: 'gtceu:distillery',
    recipeId: 'r1',
    machineCount: 1,
    overclock: 1,
    parallel: 1,
    outputMultiplier: 1,
    pack: withPicker
      ? ({
          ...pack,
          recipes: [
            { id: 'r1', machineId: 'gtceu:distillery', inputs: [], outputs: [], durationTicks: 1 },
            { id: 'r2', machineId: 'gtceu:distillery', inputs: [], outputs: [], durationTicks: 1 },
          ],
        } as PackData)
      : pack,
    onRecipeChange: () => {},
    onMachineCountChange: () => {},
    onOverclockChange: () => {},
    onPortContextMenu: () => {},
    inputPorts: inputs,
    outputPorts: outputs,
    surplusLines: [],
  };
}

describe('estimateMachineNodeHeight', () => {
  it('grows with port count but stays smaller than old minHeight stretch', () => {
    const twoPorts = estimateMachineNodeHeight(nodeData(2, false));
    const sixPorts = estimateMachineNodeHeight(nodeData(6, false));
    expect(sixPorts - twoPorts).toBe(4 * PORT_ROW_HEIGHT);
    expect(sixPorts).toBeLessThan(48 + 6 * 28);
  });

  it('ignores bloated measured height for routing bounds', () => {
    const data = nodeData(3);
    const contentHeight = estimateMachineNodeHeight(data);
    const rect = getMachineNodeRect({
      id: 'n1',
      type: 'machine',
      position: { x: 100, y: 200 },
      data,
      measured: { width: 220, height: contentHeight * 2 },
    });

    expect(rect.bottom - rect.top).toBeLessThan(contentHeight + 40);
    expect(rect.bottom).toBe(200 + contentHeight + 8);
  });
});

describe('estimateMachineNodeHeightFromPorts', () => {
  it('matches data-based estimate for the same port count', () => {
    const data = nodeData(4, false);
    expect(
      estimateMachineNodeHeightFromPorts(data.pack, data.machineId, data.recipeId, 4),
    ).toBe(estimateMachineNodeHeight(data));
  });
});
