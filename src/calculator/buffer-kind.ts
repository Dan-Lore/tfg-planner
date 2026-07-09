import type { SchemeEdge, SchemeNode } from '@/calculator/flow-solver-types';
import { normalizePortId, parsePortId } from '@/shared/ports';

export type SchemeBufferKind = 'start_buffer' | 'intermediate_buffer' | 'end_buffer';

export function getSchemeNodeKind(node: SchemeNode): string {
  return node.kind ?? 'machine';
}

export function isSchemeBufferNode(node: SchemeNode): boolean {
  const kind = getSchemeNodeKind(node);
  return (
    kind === 'start_buffer' ||
    kind === 'intermediate_buffer' ||
    kind === 'end_buffer'
  );
}

export function isSchemeStartBuffer(node: SchemeNode): boolean {
  return getSchemeNodeKind(node) === 'start_buffer';
}

export function isSchemeIntermediateBuffer(node: SchemeNode): boolean {
  return getSchemeNodeKind(node) === 'intermediate_buffer';
}

export function isSchemeEndBuffer(node: SchemeNode): boolean {
  return getSchemeNodeKind(node) === 'end_buffer';
}

export function resolveBufferTargetPort(edge: SchemeEdge): string | null {
  if (!edge.targetPort) return 'in_0';
  const portId = normalizePortId(edge.targetPort);
  return parsePortId(portId)?.kind === 'in' ? portId : null;
}

export function resolveBufferSourcePort(edge: SchemeEdge): string | null {
  if (!edge.sourcePort) return 'out_0';
  const portId = normalizePortId(edge.sourcePort);
  return parsePortId(portId)?.kind === 'out' ? portId : null;
}
