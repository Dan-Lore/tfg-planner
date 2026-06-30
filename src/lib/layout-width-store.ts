import type { BuildMachineNodeLayoutWidthsInput } from '@/canvas/machine-node-layout';
import { computeGroupLayoutWidth } from '@/canvas/machine-node-layout';
import { MACHINE_NODE_MIN_WIDTH } from '@/canvas/node-bounds';
import { machineNodeLayoutSigFragment } from '@/canvas/port-label-stubs';
import { getRecipe } from '@/data/pack-registry';
import { fnv1aHash } from '@/lib/stable-hash';
import { isMachineNode } from '@/lib/node-kind';
import type { TfgpEdge, TfgpNode } from '@/schema/tfgp-types';

export interface LayoutWidthStoreInput extends BuildMachineNodeLayoutWidthsInput {
  edges: TfgpEdge[];
  packEpoch: number;
}

type GroupEntry = { sig: string; width: number };

const groupCache = new Map<string, GroupEntry>();

function recipeHydrationSig(nodes: TfgpNode[], pack: LayoutWidthStoreInput['pack']): string {
  let ready = 0;
  for (const n of nodes) {
    if (!isMachineNode(n)) continue;
    if (getRecipe(pack, n.recipeId)) ready += 1;
  }
  return String(ready);
}

function buildMachineGroupLayoutSig(
  machineId: string,
  nodesInGroup: TfgpNode[],
  input: LayoutWidthStoreInput,
): string {
  const parts = [
    input.lang,
    String(input.packEpoch),
    recipeHydrationSig(nodesInGroup, input.pack),
    input.flowResult ? 'flow' : 'no-flow',
    machineId,
  ];
  for (const node of nodesInGroup) {
    if (!isMachineNode(node)) continue;
    parts.push(
      machineNodeLayoutSigFragment(
        node,
        input.edges,
        input.pack,
        input.lang,
        input.connectedIn.get(node.id) ?? new Set(),
        input.connectedOut.get(node.id) ?? new Set(),
        input.flowResult,
        input.t,
      ),
    );
  }
  return fnv1aHash(parts.join('|'));
}

function groupNodesByMachineId(nodes: TfgpNode[]): Map<string, TfgpNode[]> {
  const groups = new Map<string, TfgpNode[]>();
  for (const node of nodes) {
    if (!isMachineNode(node)) continue;
    const list = groups.get(node.machineId) ?? [];
    list.push(node);
    groups.set(node.machineId, list);
  }
  return groups;
}

/** Incremental per-machineId layout widths — only dirty groups recompute. */
export function resolveMachineNodeLayoutWidths(
  input: LayoutWidthStoreInput,
): Record<string, number> {
  const groups = groupNodesByMachineId(input.nodes);
  const activeMachineIds = new Set(groups.keys());

  for (const machineId of [...groupCache.keys()]) {
    if (!activeMachineIds.has(machineId)) groupCache.delete(machineId);
  }

  const widthByMachineId = new Map<string, number>();

  for (const [machineId, nodesInGroup] of groups) {
    const sig = buildMachineGroupLayoutSig(machineId, nodesInGroup, input);
    const cached = groupCache.get(machineId);
    if (cached && cached.sig === sig) {
      widthByMachineId.set(machineId, cached.width);
      continue;
    }
    const width = computeGroupLayoutWidth(machineId, nodesInGroup, input);
    groupCache.set(machineId, { sig, width });
    widthByMachineId.set(machineId, width);
  }

  const result: Record<string, number> = {};
  for (const node of input.nodes) {
    if (!isMachineNode(node)) continue;
    result[node.id] = widthByMachineId.get(node.machineId) ?? MACHINE_NODE_MIN_WIDTH;
  }
  return result;
}

/** @internal test helper */
export function clearLayoutWidthGroupCache(): void {
  groupCache.clear();
}
