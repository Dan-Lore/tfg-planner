import type { Recipe } from '@/data/types';

export const CHEM_MACHINE = 'gtceu:chemical_reactor';
export const LCR_MACHINE = 'gtceu:large_chemical_reactor';

export type RecipeLike = Pick<Recipe, 'id' | 'machineId' | 'inputs' | 'outputs' | 'durationTicks'>;

export function recipePathSuffix(id: string): string {
  const base = id.endsWith('@lcr') ? id.slice(0, -'@lcr'.length) : id;
  const slash = base.lastIndexOf('/');
  return slash >= 0 ? base.slice(slash + 1) : base;
}

export function recipeMachineFamily(machineId: string): 'chem_lcr' | 'other' {
  if (machineId === CHEM_MACHINE || machineId === LCR_MACHINE) return 'chem_lcr';
  return 'other';
}

function flowSig(flow: {
  itemId?: string;
  fluidId?: string;
  amount: number;
  chance?: number;
}): string {
  const id = flow.itemId ?? flow.fluidId ?? '';
  const ch = flow.chance ?? 10_000;
  const kind = flow.fluidId ? 'f' : 'i';
  return `${kind}:${id}:${flow.amount}:${ch}`;
}

export function recipeIoSignature(recipe: Pick<Recipe, 'inputs' | 'outputs' | 'durationTicks'>): string {
  const ins = [...recipe.inputs].map(flowSig).sort().join('|');
  const outs = [...recipe.outputs].map(flowSig).sort().join('|');
  return `${ins}>>${outs}>>${recipe.durationTicks}`;
}

/** Groups duplicate variants on the same machine slot (chem vs LCR). */
export function recipeDisplayGroupKey(recipe: RecipeLike): string {
  const io = recipeIoSignature(recipe);
  const suffix = recipePathSuffix(recipe.id);
  if (recipeMachineFamily(recipe.machineId) === 'chem_lcr') {
    const slot = recipe.machineId === LCR_MACHINE ? 'lcr' : 'chem';
    return `${slot}:${suffix}:${io}`;
  }
  return `${recipe.machineId}:${io}`;
}

export function recipeLogicalKey(recipe: RecipeLike): string {
  return recipeDisplayGroupKey(recipe);
}

/** Higher = preferred canonical id within a duplicate group. */
export function recipeCanonicalPriority(
  recipe: RecipeLike,
  canonicalSchemeIds?: ReadonlySet<string>,
): number {
  if (canonicalSchemeIds?.has(recipe.id)) return 100;
  if (recipe.machineId === LCR_MACHINE) {
    if (recipe.id.startsWith('gtceu:large_chemical_reactor/')) return 90;
    if (recipe.id.endsWith('@lcr')) return 50;
    return 40;
  }
  if (recipe.machineId === CHEM_MACHINE && recipe.id.startsWith('gtceu:chemical_reactor/')) {
    return 80;
  }
  return 0;
}

export function pickCanonicalRecipe<T extends RecipeLike>(
  recipes: readonly T[],
  options?: { canonicalSchemeIds?: ReadonlySet<string> },
): T {
  if (recipes.length === 0) {
    throw new Error('pickCanonicalRecipe: empty group');
  }
  return [...recipes].sort((a, b) => {
    const pa = recipeCanonicalPriority(a, options?.canonicalSchemeIds);
    const pb = recipeCanonicalPriority(b, options?.canonicalSchemeIds);
    if (pb !== pa) return pb - pa;
    return a.id.localeCompare(b.id);
  })[0]!;
}

export function dedupeRecipesForDisplay<T extends RecipeLike>(
  recipes: readonly T[],
  options?: { machineId?: string; canonicalSchemeIds?: ReadonlySet<string> },
): T[] {
  const filtered =
    options?.machineId != null
      ? recipes.filter((r) => r.machineId === options.machineId)
      : [...recipes];

  const groups = new Map<string, T[]>();
  for (const recipe of filtered) {
    const key = recipeDisplayGroupKey(recipe);
    const list = groups.get(key) ?? [];
    list.push(recipe);
    groups.set(key, list);
  }

  const out: T[] = [];
  for (const group of groups.values()) {
    out.push(pickCanonicalRecipe(group, options));
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

export interface NormalizeRecipeCanonResult<T extends RecipeLike> {
  recipes: T[];
  removedIds: string[];
}

export function dedupeAttachCandidates<T extends {
  machineId: string;
  portId: string;
  recipeId: string;
  recipe: RecipeLike;
}>(
  candidates: readonly T[],
  options?: { canonicalSchemeIds?: ReadonlySet<string> },
): T[] {
  const groups = new Map<string, T[]>();
  for (const candidate of candidates) {
    const key = `${candidate.machineId}:${candidate.portId}:${recipeDisplayGroupKey(candidate.recipe)}`;
    const list = groups.get(key) ?? [];
    list.push(candidate);
    groups.set(key, list);
  }

  const out: T[] = [];
  for (const group of groups.values()) {
    const winnerRecipe = pickCanonicalRecipe(
      group.map((c) => c.recipe),
      options,
    );
    const winner = group.find((c) => c.recipe.id === winnerRecipe.id) ?? group[0]!;
    out.push(winner);
  }
  return out;
}

export function normalizeRecipeCanon<T extends RecipeLike>(
  recipes: readonly T[],
  options?: { canonicalSchemeIds?: ReadonlySet<string> },
): NormalizeRecipeCanonResult<T> {
  const groups = new Map<string, T[]>();
  for (const recipe of recipes) {
    const key = recipeDisplayGroupKey(recipe);
    const list = groups.get(key) ?? [];
    list.push(recipe);
    groups.set(key, list);
  }

  const kept: T[] = [];
  const removedIds: string[] = [];
  for (const group of groups.values()) {
    const winner = pickCanonicalRecipe(group, options);
    kept.push(winner);
    for (const recipe of group) {
      if (recipe.id !== winner.id) removedIds.push(recipe.id);
    }
  }

  kept.sort((a, b) => a.id.localeCompare(b.id));
  removedIds.sort();
  return { recipes: kept, removedIds };
}
