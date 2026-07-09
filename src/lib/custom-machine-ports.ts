import type { TfgpCustomPort, TfgpCustomMachineNode, TfgpEdge } from '@/schema/tfgp';
import { inputPortId, outputPortId, parsePortId } from '@/shared/ports';

export function expandCustomPorts(
  ports: TfgpCustomPort[],
  index: number,
  product?: { itemId?: string; fluidId?: string },
): TfgpCustomPort[] {
  const next = [...ports];
  while (next.length <= index) {
    next.push({ amount: 1, ...product });
  }
  if (product && (product.itemId || product.fluidId)) {
    const existing = next[index]!;
    next[index] = {
      ...existing,
      itemId: product.itemId ?? existing.itemId,
      fluidId: product.fluidId ?? existing.fluidId,
    };
  }
  return next;
}

export function ensureCustomPortForHandle(
  node: TfgpCustomMachineNode,
  portId: string,
  product?: { itemId?: string; fluidId?: string },
): TfgpCustomMachineNode {
  const parsed = parsePortId(portId);
  if (!parsed) return node;
  if (parsed.kind === 'in') {
    return {
      ...node,
      inputs: expandCustomPorts(node.inputs, parsed.index, product),
    };
  }
  return {
    ...node,
    outputs: expandCustomPorts(node.outputs, parsed.index, product),
  };
}

export function customPortIds(node: TfgpCustomMachineNode): {
  inputPortIds: string[];
  outputPortIds: string[];
} {
  const inputPortIds = node.inputs.map((_, i) => inputPortId(i));
  const outputPortIds = node.outputs.map((_, i) => outputPortId(i));
  return { inputPortIds, outputPortIds };
}

export function portHasEdge(
  nodeId: string,
  portId: string,
  edges: readonly TfgpEdge[],
): boolean {
  return edges.some(
    (e) =>
      (e.source === nodeId && e.sourcePort === portId) ||
      (e.target === nodeId && e.targetPort === portId),
  );
}

export function createEmptyCustomMachine(
  id: string,
  position: { x: number; y: number },
): TfgpCustomMachineNode {
  return {
    id,
    kind: 'custom_machine',
    position,
    durationTicks: 20,
    machineCount: 1,
    overclock: 1,
    inputs: [],
    outputs: [],
  };
}
