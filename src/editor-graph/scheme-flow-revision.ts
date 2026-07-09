import type { TfgpFile, TfgpNode } from '@/schema/tfgp-types';
import { normalizeSchemeNodes } from '@/editor-graph/scheme-normalize';
import { fnv1aHash } from '@/lib/stable-hash';

/** Bump when solver output shape or semantics change — invalidates persisted flow cache. */
export const FLOW_SOLVER_CACHE_VERSION = 'cycle-bootstrap-v1';

/** Node fields that affect flow calculation — excludes canvas position. */
function flowRelevantNode(node: TfgpNode): Omit<TfgpNode, 'position'> {
  const { position: _position, ...rest } = node;
  return rest;
}

/** Stable fingerprint of scheme topology/settings that affect flow calculation. */
export function schemeFlowRevision(scheme: TfgpFile): string {
  const nodes = normalizeSchemeNodes(scheme.nodes).map(flowRelevantNode);
  const payload = JSON.stringify({
    solver: FLOW_SOLVER_CACHE_VERSION,
    nodes,
    edges: scheme.edges,
    edgeConstraints: scheme.edgeConstraints ?? [],
  });
  return fnv1aHash(payload);
}
