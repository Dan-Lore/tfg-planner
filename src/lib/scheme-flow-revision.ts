import type { TfgpFile, TfgpNode } from '@/schema/tfgp-types';
import { normalizeSchemeNodes } from '@/stores/editor-utils';
import { fnv1aHash } from '@/lib/stable-hash';

/** Node fields that affect flow calculation — excludes canvas position. */
function flowRelevantNode(node: TfgpNode): Omit<TfgpNode, 'position'> {
  const { position: _position, ...rest } = node;
  return rest;
}

/** Stable fingerprint of scheme topology/settings that affect flow calculation. */
export function schemeFlowRevision(scheme: TfgpFile): string {
  const nodes = normalizeSchemeNodes(scheme.nodes).map(flowRelevantNode);
  const payload = JSON.stringify({
    nodes,
    edges: scheme.edges,
    targets: scheme.targets,
  });
  return fnv1aHash(payload);
}
