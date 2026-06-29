import type { TfgpFile, TfgpNode } from '@/schema/tfgp';
import { normalizeSchemeNodes } from '@/stores/editor-utils';

/** Node fields that affect flow calculation — excludes canvas position. */
function flowRelevantNode(node: TfgpNode): Omit<TfgpNode, 'position'> {
  const { position: _position, ...rest } = node;
  return rest;
}

/** Stable fingerprint of scheme topology/settings that affect flow calculation. */
export function schemeFlowRevision(scheme: TfgpFile): string {
  const nodes = normalizeSchemeNodes(scheme.nodes).map(flowRelevantNode);
  return JSON.stringify({
    nodes,
    edges: scheme.edges,
    targets: scheme.targets,
  });
}
