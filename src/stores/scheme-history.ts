import type { TfgpEdge, TfgpNode } from '@/schema/tfgp';

export const MAX_SCHEME_HISTORY = 50;

export interface SchemeHistorySnapshot {
  nodes: TfgpNode[];
  edges: TfgpEdge[];
  edgeConstraints: import('@/schema/tfgp').TfgpEdgeConstraint[];
  viewport: { x: number; y: number; zoom: number };
}

export function trimHistoryPast<T>(past: T[], max = MAX_SCHEME_HISTORY): T[] {
  return past.slice(-max + 1);
}
