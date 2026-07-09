import type { Recipe } from '@/data/types';
import { productKey } from '@/shared/ports';
import { edgeProductMatchesFlow } from '@/shared/flow-match';
import { buildTagIndex } from '@/shared/tag-index';
import {
  isEndBufferNode,
  isFlowMachineNode,
  isIntermediateBufferNode,
} from '@/shared/node-kind';
import { resolveSourceOutputPort } from '@/calculator/port-resolution';
import type { TfgpEdge, TfgpNode } from '@/schema/tfgp';
import type { SchemeIssue } from '@/scheme-check/check-scheme';
import { machineContext, nodeLabel, recipeForNode } from '@/scheme-check/structural/check-edge';

export function checkDisconnectedOutputs(
  nodes: TfgpNode[],
  edges: TfgpEdge[],
  recipes: Map<string, Recipe>,
  tags: ReturnType<typeof buildTagIndex>,
): SchemeIssue[] {
  const issues: SchemeIssue[] = [];
  const outgoingBySource = new Map<string, TfgpEdge[]>();
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  for (const edge of edges) {
    if (!outgoingBySource.has(edge.source)) outgoingBySource.set(edge.source, []);
    outgoingBySource.get(edge.source)!.push(edge);
  }

  for (const node of nodes) {
    if (!isFlowMachineNode(node)) continue;
    const recipe = recipeForNode(node, recipes);
    if (!recipe) continue;

    for (let i = 0; i < recipe.outputs.length; i++) {
      const portId = `out_${i}`;
      const output = recipe.outputs[i]!;
      const outKey = productKey(output);
      const portEdges = (outgoingBySource.get(node.id) ?? []).filter((edge) => {
        const resolved = resolveSourceOutputPort(edge, recipe);
        return resolved === portId;
      });
      if (portEdges.length === 0) {
        issues.push({
          severity: 'warning',
          code: 'disconnected_output',
          message: `${nodeLabel(node)}: выход ${portId} (${outKey}) не подключён`,
          nodeId: node.id,
          context: {
            ...machineContext(node),
            portId,
            productId: outKey,
          },
        });
        continue;
      }

      const hasSink = portEdges.some((edge) => {
        const target = nodeById.get(edge.target);
        if (!target) return false;
        if (isEndBufferNode(target) || isIntermediateBufferNode(target)) return true;
        if (!isFlowMachineNode(target)) return false;
        const targetRecipe = recipeForNode(target, recipes);
        if (!targetRecipe) return false;
        return edgeProductMatchesFlow(edge, output, tags);
      });
      if (!hasSink) {
        issues.push({
          severity: 'warning',
          code: 'disconnected_output',
          message: `${nodeLabel(node)}: выход ${portId} (${outKey}) не подключён к потребителю`,
          nodeId: node.id,
          context: {
            ...machineContext(node),
            portId,
            productId: outKey,
          },
        });
      }
    }
  }

  return issues;
}

export function checkDisconnectedInputs(
  nodes: TfgpNode[],
  edges: TfgpEdge[],
  recipes: Map<string, Recipe>,
): SchemeIssue[] {
  const issues: SchemeIssue[] = [];
  const connectedIn = new Map<string, Set<string>>();

  for (const edge of edges) {
    if (!connectedIn.has(edge.target)) connectedIn.set(edge.target, new Set());
    connectedIn.get(edge.target)!.add(edge.targetPort);
  }

  for (const node of nodes) {
    if (!isFlowMachineNode(node)) continue;
    const recipe = recipeForNode(node, recipes);
    if (!recipe) continue;
    const ports = connectedIn.get(node.id) ?? new Set<string>();
    for (let i = 0; i < recipe.inputs.length; i++) {
      const portId = `in_${i}`;
      if (ports.has(portId)) continue;
      const inp = recipe.inputs[i]!;
      issues.push({
        severity: 'warning',
        code: 'disconnected_input',
        message: `${nodeLabel(node)}: вход ${portId} (${productKey(inp)}) не подключён`,
        nodeId: node.id,
        context: {
          ...machineContext(node),
          portId,
          productId: productKey(inp),
        },
      });
    }
  }

  return issues;
}
