import type { PackLike } from '@/data/pack-registry';
import { getItemName } from '@/data/pack-registry';
import type { Flow, Recipe } from '@/data/types';
import { formatFlowQuantityLabel } from '@/lib/flow-chance';
import { productInputs } from '@/lib/recipe-product-flows';

function flowName(pack: PackLike, flow: Flow, lang: 'ru' | 'en'): string {
  const id = flow.itemId ?? flow.fluidId ?? '?';
  return getItemName(pack, id, lang);
}

function formatSide(
  pack: PackLike,
  flows: Flow[],
  lang: 'ru' | 'en',
  maxItems = 2,
): string {
  if (flows.length === 0) return '—';
  const parts = flows
    .slice(0, maxItems)
    .map((f) => formatFlowQuantityLabel(f, flowName(pack, f, lang)));
  const rest = flows.length - maxItems;
  if (rest > 0) parts.push(`+${rest}`);
  return parts.join(', ');
}

export function formatRecipeLabel(
  pack: PackLike,
  recipe: Recipe,
  lang: 'ru' | 'en',
): string {
  const inputs = formatSide(pack, productInputs(recipe), lang);
  const outputs = formatSide(pack, recipe.outputs, lang);
  if (recipe.inputs.length === 0 && recipe.outputs.length === 0) {
    const tail = recipe.id.includes(':') ? recipe.id.split(':').pop()! : recipe.id;
    return tail;
  }
  return `${inputs} → ${outputs}`;
}
