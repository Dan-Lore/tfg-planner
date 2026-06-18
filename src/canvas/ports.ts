import type { PackData, Flow, Recipe } from '@/data/types';
import { getItemName } from '@/data/pack-registry';
import type { TagIndex } from '@/lib/tag-index';
import { flowsCompatible } from '@/lib/flow-match';

export function productKey(flow: { itemId?: string; fluidId?: string }): string {
  return flow.itemId ?? flow.fluidId ?? '';
}

export function flowKey(flow: { itemId?: string; fluidId?: string }): string {
  if (flow.fluidId) return `fluid:${flow.fluidId}`;
  return `item:${flow.itemId ?? ''}`;
}

export function normalizePortId(port: string): string {
  return port.replace(/^output_/, 'out_').replace(/^input_/, 'in_');
}

export function flowLabel(
  flow: { itemId?: string; fluidId?: string },
  pack: PackData,
  lang: 'ru' | 'en',
  amount?: number,
): string {
  const id = flow.itemId ?? flow.fluidId ?? '?';
  const name = getItemName(pack, id, lang);
  if (amount !== undefined) return `${amount}× ${name}`;
  return name;
}

export function inputPortId(index: number): string {
  return `in_${index}`;
}

export function outputPortId(index: number): string {
  return `out_${index}`;
}

export function parsePortId(port: string): { kind: 'in' | 'out'; index: number } | null {
  const m = port.match(/^(in|out)_(\d+)$/);
  if (!m) return null;
  return { kind: m[1] as 'in' | 'out', index: Number(m[2]) };
}

export function portFlow(recipe: Recipe | undefined, port: string): Flow | null {
  if (!recipe) return null;
  const parsed = parsePortId(port);
  if (!parsed) return null;
  const list = parsed.kind === 'in' ? recipe.inputs : recipe.outputs;
  return list[parsed.index] ?? null;
}

export function portsMatch(
  sourceFlow: Flow | null,
  targetFlow: Flow | null,
  tags?: TagIndex,
): boolean {
  if (!sourceFlow || !targetFlow) return false;
  if (tags) return flowsCompatible(sourceFlow, targetFlow, tags);
  return flowKey(sourceFlow) === flowKey(targetFlow);
}
