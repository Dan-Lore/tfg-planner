import type { TfgpEdge, TfgpNode } from '@/schema/tfgp';
import type { ActivePack } from '@/data/pack-runtime';
import {
  indexSchemeIssues,
  type SchemeCheckResult,
  type SchemeIssue,
} from '@/scheme-check/check-scheme';
import { formatSchemeIssueSummary } from '@/scheme-check/format-scheme-issue';

export function listNodeIssues(
  nodeId: string,
  schemeCheck: SchemeCheckResult | null,
): SchemeIssue[] {
  if (!schemeCheck) return [];
  const index = indexSchemeIssues(schemeCheck);
  return (index.byNodeId.get(nodeId) ?? []).filter((i) => i.severity !== 'info');
}

export function pickNodeIssueMeta(
  nodeId: string,
  schemeCheck: SchemeCheckResult | null,
  pack: ActivePack | null,
  lang: 'ru' | 'en',
  nodes: TfgpNode[],
  edges: TfgpEdge[],
  t: (key: string, opts?: Record<string, string>) => string,
): { severity: 'error' | 'warning'; title: string } | undefined {
  if (!schemeCheck) return undefined;
  const index = indexSchemeIssues(schemeCheck);
  const severity = index.worstByNodeId.get(nodeId);
  if (!severity || severity === 'info') return undefined;
  const issues = index.byNodeId.get(nodeId) ?? [];
  const first = issues.find((i) => i.severity === severity);
  return first
    ? {
        severity,
        title: formatSchemeIssueSummary(first, pack, lang, nodes, edges, t),
      }
    : undefined;
}

export function pickEdgeIssueMeta(
  edgeId: string,
  schemeCheck: SchemeCheckResult | null,
  pack: ActivePack | null,
  lang: 'ru' | 'en',
  nodes: TfgpNode[],
  edges: TfgpEdge[],
  t: (key: string, opts?: Record<string, string>) => string,
): { severity: 'error' | 'warning'; title: string } | undefined {
  if (!schemeCheck) return undefined;
  const index = indexSchemeIssues(schemeCheck);
  const severity = index.worstByEdgeId.get(edgeId);
  if (!severity || severity === 'info') return undefined;
  const issues = index.byEdgeId.get(edgeId) ?? [];
  const first = issues.find((i) => i.severity === severity);
  return first
    ? {
        severity,
        title: formatSchemeIssueSummary(first, pack, lang, nodes, edges, t),
      }
    : undefined;
}
