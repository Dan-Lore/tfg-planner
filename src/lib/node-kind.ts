import type {
  TfgpBufferKind,
  TfgpEndBufferNode,
  TfgpIntermediateBufferNode,
  TfgpNode,
  TfgpNodeKind,
  TfgpStartBufferNode,
} from '@/schema/tfgp-types';

export function getNodeKind(node: TfgpNode): TfgpNodeKind {
  return node.kind ?? 'machine';
}

export function isMachineNode(
  node: TfgpNode,
): node is TfgpNode & { kind?: 'machine'; machineId: string; recipeId: string } {
  return getNodeKind(node) === 'machine';
}

export function isStartBufferNode(node: TfgpNode): node is TfgpStartBufferNode {
  return getNodeKind(node) === 'start_buffer';
}

export function isIntermediateBufferNode(
  node: TfgpNode,
): node is TfgpIntermediateBufferNode {
  return getNodeKind(node) === 'intermediate_buffer';
}

export function isEndBufferNode(node: TfgpNode): node is TfgpEndBufferNode {
  return getNodeKind(node) === 'end_buffer';
}

export function isBufferNode(node: TfgpNode): node is
  | TfgpStartBufferNode
  | TfgpIntermediateBufferNode
  | TfgpEndBufferNode {
  const kind = getNodeKind(node);
  return kind === 'start_buffer' || kind === 'intermediate_buffer' || kind === 'end_buffer';
}

export function getBufferKind(node: TfgpNode): TfgpBufferKind | null {
  const kind = getNodeKind(node);
  if (kind === 'start_buffer' || kind === 'intermediate_buffer' || kind === 'end_buffer') {
    return kind;
  }
  return null;
}

export function getNodeProduct(node: TfgpNode): {
  itemId?: string;
  fluidId?: string;
} {
  if (isBufferNode(node)) {
    return { itemId: node.itemId, fluidId: node.fluidId };
  }
  return {};
}

export function bufferHasInputPort(kind: TfgpBufferKind): boolean {
  return kind === 'intermediate_buffer' || kind === 'end_buffer';
}

export function bufferHasOutputPort(kind: TfgpBufferKind): boolean {
  return kind === 'start_buffer' || kind === 'intermediate_buffer';
}
