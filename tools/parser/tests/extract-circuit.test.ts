import { describe, expect, it } from 'vitest';
import {
  extractCircuitFromFlows,
  isCircuitOnlyBrokenRecipe,
  PROGRAMMED_CIRCUIT_ID,
} from '../src/pipeline/extract-circuit.js';

describe('extract-circuit', () => {
  it('moves programmed circuit to configuration', () => {
    const { productInputs, circuitConfiguration } = extractCircuitFromFlows([
      { itemId: '#forge:ingots/copper', amount: 1 },
      { itemId: PROGRAMMED_CIRCUIT_ID, amount: 8 },
    ]);
    expect(productInputs).toEqual([{ itemId: '#forge:ingots/copper', amount: 1 }]);
    expect(circuitConfiguration).toBe(8);
  });

  it('detects circuit-only broken recipes', () => {
    expect(
      isCircuitOnlyBrokenRecipe({
        inputs: [{ itemId: PROGRAMMED_CIRCUIT_ID, amount: 16 }],
        outputs: [],
      }),
    ).toBe(true);
    expect(
      isCircuitOnlyBrokenRecipe({
        inputs: [{ itemId: '#forge:ingots/copper', amount: 1 }],
        outputs: [{ itemId: 'gtceu:copper_wire', amount: 8 }],
      }),
    ).toBe(false);
  });
});
