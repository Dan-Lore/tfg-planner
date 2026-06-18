import { describe, it, expect } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseKubeJsFile } from '../src/kubejs/parse-file.js';
import { summarizeWarningsByKind } from '../src/validate/schema.js';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

describe('tail warning taxonomy', () => {
  it('skips forEach in tags.js', () => {
    const result = parseKubeJsFile(join(fixtures, 'tags-forEach.js'));
    expect(result.warnings).toHaveLength(0);
  });

  it('skips modifyResult on shaped recipes', () => {
    const result = parseKubeJsFile(join(fixtures, 'modifyResult-crafting.js'));
    expect(result.warnings).toHaveLength(0);
  });

  it('skips findRecipes that only add recipeConditions', () => {
    const result = parseKubeJsFile(join(fixtures, 'findRecipes-dimension.js'));
    expect(result.warnings).toHaveLength(0);
  });

  it('warns on forEach that calls recipe helpers', () => {
    const result = parseKubeJsFile(join(fixtures, 'unhandled-forEach-recipes.js'));
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].kind).toBe('forEach');
  });

  it('aggregates warningsByKind in build report', () => {
    const warnings = [
      { file: 'a.js', reason: 'x', kind: 'forEach' as const },
      { file: 'b.js', reason: 'y', kind: 'forEach' as const },
      { file: 'c.js', reason: 'z', kind: 'findRecipes' as const },
    ];
    expect(summarizeWarningsByKind(warnings)).toEqual({ forEach: 2, findRecipes: 1 });
  });
});
