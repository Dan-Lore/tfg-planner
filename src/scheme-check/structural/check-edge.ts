import { customMachineRecipeId } from '@/calculator/custom-machine-recipe';
import type { Recipe } from '@/data/types';
import { nodePortFlow, portsMatch } from '@/shared/node-port-flow';
import { parsePortId, productKey } from '@/shared/ports';
import { edgeProductMatchesFlow } from '@/shared/flow-match';
import { buildTagIndex } from '@/shared/tag-index';
import {
  isBufferNode,
  isCustomMachineNode,
  isMachineNode,
} from '@/shared/node-kind';
import type { PackData } from '@/data/types';
import type { TfgpEdge, TfgpNode } from '@/schema/tfgp';
import type { SchemeIssue, SchemeIssueContext } from '@/scheme-check/check-scheme';

export function recipeForNode(
  node: TfgpNode,
  recipes: Map<string, Recipe>,
): Recipe | undefined {
  if (isCustomMachineNode(node)) {
    return recipes.get(customMachineRecipeId(node.id));
  }
  if (!isMachineNode(node)) return undefined;
  return recipes.get(node.recipeId);
}

export function machineContext(node: TfgpNode): SchemeIssueContext | undefined {
  if (!isMachineNode(node)) return undefined;
  return { machineId: node.machineId, recipeId: node.recipeId };
}

export function nodeLabel(node: TfgpNode): string {
  if (isCustomMachineNode(node)) {
    return `${node.id} (custom_machine)`;
  }
  if (isMachineNode(node)) {
    return `${node.id} (${node.machineId}, ${node.recipeId})`;
  }
  const product = node.itemId ?? node.fluidId ?? '?';
  return `${node.id} (${node.kind ?? 'buffer'}, ${product})`;
}

function edgeLabel(edge: TfgpEdge): string {
  const product = edge.itemId ?? edge.fluidId ?? '?';
  return `${edge.id}: ${edge.source} → ${edge.target} [${product}]`;
}

function portCount(recipe: Recipe, kind: 'in' | 'out'): number {
  return kind === 'in' ? recipe.inputs.length : recipe.outputs.length;
}

function isPortInRange(recipe: Recipe | undefined, port: string): boolean {
  if (!recipe) return false;
  const parsed = parsePortId(port);
  if (!parsed) return false;
  return parsed.index >= 0 && parsed.index < portCount(recipe, parsed.kind);
}

export function checkEdge(
  edge: TfgpEdge,
  nodeById: Map<string, TfgpNode>,
  pack: PackData,
  recipes: Map<string, Recipe>,
  tags: ReturnType<typeof buildTagIndex>,
): SchemeIssue[] {
  const issues: SchemeIssue[] = [];
  const src = nodeById.get(edge.source);
  const tgt = nodeById.get(edge.target);

  if (!src) {
    issues.push({
      severity: 'error',
      code: 'missing_node',
      message: `Связь ${edge.id}: источник «${edge.source}» не найден`,
      edgeId: edge.id,
      context: { productId: edge.source },
    });
    return issues;
  }
  if (!tgt) {
    issues.push({
      severity: 'error',
      code: 'missing_node',
      message: `Связь ${edge.id}: приёмник «${edge.target}» не найден`,
      edgeId: edge.id,
      context: { productId: edge.target },
    });
    return issues;
  }

  const srcRecipe = recipeForNode(src, recipes);
  const tgtRecipe = recipeForNode(tgt, recipes);

  if (isMachineNode(src) && !srcRecipe) {
    issues.push({
      severity: 'error',
      code: 'missing_recipe',
      message: `Узел ${nodeLabel(src)}: рецепт «${src.recipeId}» отсутствует в pack ${pack.modpackVersion}`,
      nodeId: src.id,
      edgeId: edge.id,
      context: { ...machineContext(src), recipeId: src.recipeId },
    });
  } else if (isCustomMachineNode(src) && !srcRecipe) {
    issues.push({
      severity: 'warning',
      code: 'missing_recipe',
      message: `Узел ${nodeLabel(src)}: нет выходов — расчёт потоков невозможен`,
      nodeId: src.id,
      edgeId: edge.id,
    });
  }
  if (isMachineNode(tgt) && !tgtRecipe) {
    issues.push({
      severity: 'error',
      code: 'missing_recipe',
      message: `Узел ${nodeLabel(tgt)}: рецепт «${tgt.recipeId}» отсутствует в pack ${pack.modpackVersion}`,
      nodeId: tgt.id,
      edgeId: edge.id,
      context: { ...machineContext(tgt), recipeId: tgt.recipeId },
    });
  } else if (isCustomMachineNode(tgt) && !tgtRecipe) {
    issues.push({
      severity: 'warning',
      code: 'missing_recipe',
      message: `Узел ${nodeLabel(tgt)}: нет выходов — расчёт потоков невозможен`,
      nodeId: tgt.id,
      edgeId: edge.id,
    });
  }

  const srcFlow = nodePortFlow(src, edge.sourcePort, srcRecipe);
  const tgtFlow = nodePortFlow(tgt, edge.targetPort, tgtRecipe);

  if ((isMachineNode(src) || isCustomMachineNode(src)) && srcRecipe && !isPortInRange(srcRecipe, edge.sourcePort)) {
    issues.push({
      severity: 'error',
      code: 'invalid_source_port',
      message: `${edgeLabel(edge)}: порт ${edge.sourcePort} не существует у рецепта (выходов: ${srcRecipe.outputs.length})`,
      edgeId: edge.id,
      nodeId: src.id,
      context: {
        ...machineContext(src),
        portId: edge.sourcePort,
        outputCount: String(srcRecipe.outputs.length),
      },
    });
  } else if ((isMachineNode(src) || isCustomMachineNode(src)) && srcRecipe && !srcFlow) {
    issues.push({
      severity: 'error',
      code: 'invalid_source_port',
      message: `${edgeLabel(edge)}: не удалось определить продукт на ${edge.sourcePort}`,
      edgeId: edge.id,
      nodeId: src.id,
      context: { ...machineContext(src), portId: edge.sourcePort },
    });
  }

  if ((isMachineNode(tgt) || isCustomMachineNode(tgt)) && tgtRecipe && !isPortInRange(tgtRecipe, edge.targetPort)) {
    issues.push({
      severity: 'error',
      code: 'invalid_target_port',
      message: `${edgeLabel(edge)} → ${edge.targetPort}: порт не существует (входов: ${tgtRecipe.inputs.length}). Такая связь обнуляет выход апстрима в расчёте потоков`,
      edgeId: edge.id,
      nodeId: tgt.id,
      context: {
        ...machineContext(tgt),
        portId: edge.targetPort,
        inputCount: String(tgtRecipe.inputs.length),
      },
    });
  } else if ((isMachineNode(tgt) || isCustomMachineNode(tgt)) && tgtRecipe && !tgtFlow) {
    issues.push({
      severity: 'error',
      code: 'invalid_target_port',
      message: `${edgeLabel(edge)} → ${edge.targetPort}: не удалось определить продукт на входе`,
      edgeId: edge.id,
      nodeId: tgt.id,
      context: { ...machineContext(tgt), portId: edge.targetPort },
    });
  }

  if (isBufferNode(src)) {
    const parsed = parsePortId(edge.sourcePort);
    if (!parsed || parsed.kind !== 'out') {
      issues.push({
        severity: 'error',
        code: 'buffer_port_direction',
        message: `${edgeLabel(edge)}: у буфера-источника ожидается out-порт, указан ${edge.sourcePort}`,
        edgeId: edge.id,
        nodeId: src.id,
        context: { portId: edge.sourcePort },
      });
    }
  }
  if (isBufferNode(tgt)) {
    const parsed = parsePortId(edge.targetPort);
    if (!parsed || parsed.kind !== 'in') {
      issues.push({
        severity: 'error',
        code: 'buffer_port_direction',
        message: `${edgeLabel(edge)}: у буфера-приёмника ожидается in-порт, указан ${edge.targetPort}`,
        edgeId: edge.id,
        nodeId: tgt.id,
        context: { portId: edge.targetPort },
      });
    }
  }

  if (srcFlow && tgtFlow && !portsMatch(srcFlow, tgtFlow, tags)) {
    const edgeKey = edge.itemId ?? edge.fluidId ?? '';
    const srcKey = productKey(srcFlow);
    const tgtKey = productKey(tgtFlow);

    if (edgeKey && !edgeProductMatchesFlow(edge, srcFlow, tags)) {
      issues.push({
        severity: 'error',
        code: 'edge_source_product_mismatch',
        message: `${edgeLabel(edge)}: на ${edge.sourcePort} рецепт отдаёт «${srcKey}», а в связи указано «${edgeKey}»`,
        edgeId: edge.id,
        nodeId: src.id,
        context: {
          ...machineContext(src),
          portId: edge.sourcePort,
          srcProductId: srcKey,
          edgeProductId: edgeKey,
        },
      });
    } else if (tgtKey.startsWith('#') && edgeKey === srcKey) {
      issues.push({
        severity: 'warning',
        code: 'tag_input_unverified',
        message: `${edgeLabel(edge)}: вход — тег ${tgtKey}; совместимость тега не верифицируется pack data`,
        edgeId: edge.id,
        nodeId: tgt.id,
        context: {
          ...machineContext(tgt),
          portId: edge.targetPort,
          tgtProductId: tgtKey,
          srcProductId: srcKey,
          edgeProductId: edgeKey,
        },
      });
    } else {
      issues.push({
        severity: 'error',
        code: 'product_mismatch',
        message: `${edgeLabel(edge)}: несовместимые продукты — ${srcKey} → ${tgtKey} (${edge.sourcePort} → ${edge.targetPort})`,
        edgeId: edge.id,
        context: {
          portId: `${edge.sourcePort} → ${edge.targetPort}`,
          srcProductId: srcKey,
          tgtProductId: tgtKey,
        },
      });
    }
  } else if (srcFlow) {
    const edgeKey = edge.itemId ?? edge.fluidId ?? '';
    const srcKey = productKey(srcFlow);
    if (edgeKey && !edgeProductMatchesFlow(edge, srcFlow, tags)) {
      issues.push({
        severity: 'error',
        code: 'edge_source_product_mismatch',
        message: `${edgeLabel(edge)}: на ${edge.sourcePort} рецепт отдаёт «${srcKey}», а в связи указано «${edgeKey}»`,
        edgeId: edge.id,
        nodeId: src.id,
        context: {
          ...machineContext(src),
          portId: edge.sourcePort,
          srcProductId: srcKey,
          edgeProductId: edgeKey,
        },
      });
    }
  }

  return issues;
}
