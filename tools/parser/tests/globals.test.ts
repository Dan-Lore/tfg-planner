import { describe, it, expect } from 'vitest';
import { parseStartupGlobals } from '../src/kubejs/parse-globals.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const fixturesStartup = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'startup');

describe('parseStartupGlobals', () => {
  it('parses string and object global arrays from startup scripts', () => {
    const globals = parseStartupGlobals(fixturesStartup);
    expect(globals.TFC_WOOD_TYPES).toEqual(['oak', 'birch']);
    expect(globals.ADD_CIRCUIT).toEqual([
      { recipeId: 'gtceu:mixer/test', circuitNumber: 2 },
    ]);
  });
});
