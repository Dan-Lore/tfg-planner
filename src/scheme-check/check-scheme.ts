import { buildRecipeMapForScheme, customMachineRecipeId } from '@/calculator/custom-machine-recipe';
import type { FlowResult } from '@/calculator/flow-solver';
import { analyzeCycles, isBalancedNet, type CycleAnalysisNode } from '@/calculator/cycle-analysis';
import type { PackData, Recipe } from '@/data/types';
import { nodePortFlow, parsePortId, portsMatch, productKey } from '@/canvas/ports';
import { edgeProductMatchesFlow, flowsCompatible } from '@/lib/flow-match';
import { buildTagIndex } from '@/lib/tag-index';
import { isBufferNode, isCustomMachineNode, isEndBufferNode, isFlowMachineNode, isIntermediateBufferNode, isMachineNode, isStartBufferNode } from '@/lib/node-kind';
import { resolveSourceOutputPort } from '@/calculator/port-resolution';
import { normalizeSchemeNodes } from '@/stores/editor-utils';
import type { TfgpEdge, TfgpFile, TfgpNode, TfgpTarget } from '@/schema/tfgp';

export type SchemeIssueSeverity = 'error' | 'warning' | 'info';

export type SchemeIssueCode =
  | 'missing_node'
  | 'missing_recipe'
  | 'invalid_source_port'
  | 'invalid_target_port'
  | 'product_mismatch'
  | 'buffer_port_direction'
  | 'disconnected_input'
  | 'disconnected_output'
  | 'orphan_start_buffer'
  | 'target_on_buffer'
  | 'target_not_output'
  | 'target_missing_node'
  | 'cycle_product_deficit'
  | 'cycle_product_surplus'
  | 'cycle_not_running'
  | 'catalyst_imbalance'
  | 'pack_version_missing'
  | 'tag_input_unverified'
  | 'edge_source_product_mismatch';

export interface SchemeIssueContext {
  portId?: string;
  productId?: string;
  srcProductId?: string;
  tgtProductId?: string;
  edgeProductId?: string;
  recipeId?: string;
  machineId?: string;
  outputCount?: string;
  inputCount?: string;
  theoreticalRate?: string;
  netRate?: string;
  sccIndex?: string;
  nodeIds?: string;
  balanceRatio?: string;
}

export interface SchemeIssue {
  severity: SchemeIssueSeverity;
  code: SchemeIssueCode;
  message: string;
  edgeId?: string;
  nodeId?: string;
  context?: SchemeIssueContext;
}

export interface SchemeCheckSummary {
  nodeCount: number;
  edgeCount: number;
  machineCount: number;
  errorCount: number;
  warningCount: number;
}

export interface SchemeCheckResult {
  ok: boolean;
  schemeName: string;
  modpackVersion: string;
  issues: SchemeIssue[];
  summary: SchemeCheckSummary;
}

export interface SchemeIssueIndex {
  byEdgeId: ReadonlyMap<string, readonly SchemeIssue[]>;
  byNodeId: ReadonlyMap<string, readonly SchemeIssue[]>;
  worstByEdgeId: ReadonlyMap<string, SchemeIssueSeverity>;
  worstByNodeId: ReadonlyMap<string, SchemeIssueSeverity>;
}

const SEVERITY_RANK: Record<SchemeIssueSeverity, number> = {
  error: 2,
  warning: 1,
  info: 0,
};

export function worstIssueSeverity(
  a: SchemeIssueSeverity | undefined,
  b: SchemeIssueSeverity,
): SchemeIssueSeverity {
  if (!a) return b;
  return SEVERITY_RANK[b] > SEVERITY_RANK[a] ? b : a;
}

export function indexSchemeIssues(result: SchemeCheckResult): SchemeIssueIndex {
  const byEdgeId = new Map<string, SchemeIssue[]>();
  const byNodeId = new Map<string, SchemeIssue[]>();
  const worstByEdgeId = new Map<string, SchemeIssueSeverity>();
  const worstByNodeId = new Map<string, SchemeIssueSeverity>();

  for (const issue of result.issues) {
    if (issue.edgeId) {
      const list = byEdgeId.get(issue.edgeId) ?? [];
      list.push(issue);
      byEdgeId.set(issue.edgeId, list);
      worstByEdgeId.set(
        issue.edgeId,
        worstIssueSeverity(worstByEdgeId.get(issue.edgeId), issue.severity),
      );
    }
    if (issue.nodeId) {
      const list = byNodeId.get(issue.nodeId) ?? [];
      list.push(issue);
      byNodeId.set(issue.nodeId, list);
      worstByNodeId.set(
        issue.nodeId,
        worstIssueSeverity(worstByNodeId.get(issue.nodeId), issue.severity),
      );
    }
  }

  return { byEdgeId, byNodeId, worstByEdgeId, worstByNodeId };
}

function recipeForNode(
  node: TfgpNode,
  recipes: Map<string, Recipe>,
): Recipe | undefined {
  if (isCustomMachineNode(node)) {
    return recipes.get(customMachineRecipeId(node.id));
  }
  if (!isMachineNode(node)) return undefined;
  return recipes.get(node.recipeId);
}

function recipeMapFromPack(pack: PackData, nodes: TfgpNode[]): Map<string, Recipe> {
  return buildRecipeMapForScheme(pack, nodes);
}

function machineContext(node: TfgpNode): SchemeIssueContext | undefined {
  if (!isMachineNode(node)) return undefined;
  return { machineId: node.machineId, recipeId: node.recipeId };
}

function nodeLabel(node: TfgpNode): string {
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

function checkEdge(
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

function recipeOutputMatchesTarget(
  recipe: Recipe,
  targetKey: string,
  tags: ReturnType<typeof buildTagIndex>,
): boolean {
  for (const output of recipe.outputs) {
    const outKey = productKey(output);
    if (outKey === targetKey) return true;
    if (flowsCompatible(output, { itemId: targetKey, amount: 1 }, tags)) return true;
    if (flowsCompatible(output, { fluidId: targetKey, amount: 1 }, tags)) return true;
  }
  return false;
}

function checkDisconnectedOutputs(
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

function checkOrphanStartBuffers(
  nodes: TfgpNode[],
  edges: TfgpEdge[],
): SchemeIssue[] {
  const issues: SchemeIssue[] = [];
  const hasOutgoing = new Set(edges.map((e) => e.source));

  for (const node of nodes) {
    if (!isStartBufferNode(node)) continue;
    if (hasOutgoing.has(node.id)) continue;
    const product = node.itemId ?? node.fluidId ?? '?';
    issues.push({
      severity: 'info',
      code: 'orphan_start_buffer',
      message: `${nodeLabel(node)}: стартовый буфер не подключён к схеме`,
      nodeId: node.id,
      context: { productId: product },
    });
  }

  return issues;
}

function toCycleAnalysisNodes(nodes: TfgpNode[]): CycleAnalysisNode[] {
  return nodes.map((n) => {
    if (isCustomMachineNode(n)) {
      return {
        id: n.id,
        kind: 'custom_machine' as const,
        recipeId: customMachineRecipeId(n.id),
        machineCount: n.machineCount,
        overclock: n.overclock,
        durationTicks: n.durationTicks,
        customInputs: n.inputs,
        customOutputs: n.outputs,
        primaryOutputIndex: n.primaryOutputIndex,
      };
    }
    if (isMachineNode(n)) {
      return {
        id: n.id,
        kind: 'machine' as const,
        machineId: n.machineId,
        recipeId: n.recipeId,
        machineCount: n.machineCount,
        overclock: n.overclock,
        voltageTier: n.voltageTier,
        primaryOutputIndex: n.primaryOutputIndex,
      };
    }
    if (isIntermediateBufferNode(n)) {
      return {
        id: n.id,
        kind: 'intermediate_buffer' as const,
        itemId: n.itemId,
        fluidId: n.fluidId,
      };
    }
    return { id: n.id, kind: n.kind };
  });
}

function checkCycleBalance(
  scheme: TfgpFile,
  pack: PackData,
  flowResult: FlowResult,
  tags: ReturnType<typeof buildTagIndex>,
): SchemeIssue[] {
  const issues: SchemeIssue[] = [];
  const nodes = toCycleAnalysisNodes(normalizeSchemeNodes(scheme.nodes, pack));
  const analysis = analyzeCycles(nodes, scheme.edges, pack, flowResult, tags);
  const notRunningSccs = new Set(analysis.notRunning.map((n) => n.sccIndex));

  for (const { sccIndex, nodeIds } of analysis.notRunning) {
    issues.push({
      severity: 'warning',
      code: 'cycle_not_running',
      message: `Петля ${sccIndex + 1} (${nodeIds.join(', ')}): потоки ≈ 0 при ненулевой теоретической мощности`,
      context: {
        sccIndex: String(sccIndex + 1),
        nodeIds: nodeIds.join(', '),
      },
    });
  }

  for (const balance of analysis.balances) {
    if (notRunningSccs.has(balance.sccIndex)) continue;
    if (isBalancedNet(balance.net)) continue;
    const net = balance.net.toNumber();
    const code = net < 0 ? 'cycle_product_deficit' : 'cycle_product_surplus';
    issues.push({
      severity: 'warning',
      code,
      message: `Петля ${balance.sccIndex + 1}: ${balance.productId} net ${net.toFixed(6)}/s`,
      context: {
        sccIndex: String(balance.sccIndex + 1),
        productId: balance.productId,
        netRate: net.toFixed(6),
      },
    });
  }

  for (const imbalance of analysis.catalystImbalances) {
    issues.push({
      severity: 'warning',
      code: 'catalyst_imbalance',
      message: `Петля ${imbalance.sccIndex + 1}: катализатор ${imbalance.productId} consume/produce ≈ ${imbalance.ratio.toFixed(3)}`,
      context: {
        sccIndex: String(imbalance.sccIndex + 1),
        productId: imbalance.productId,
        balanceRatio: imbalance.ratio.toFixed(4),
        nodeIds: imbalance.nodeIds.join(', '),
      },
    });
  }

  return issues;
}

function checkDisconnectedInputs(
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

function checkTargets(
  targets: TfgpTarget[],
  nodeById: Map<string, TfgpNode>,
  recipes: Map<string, Recipe>,
  tags: ReturnType<typeof buildTagIndex>,
): SchemeIssue[] {
  const issues: SchemeIssue[] = [];
  for (const target of targets) {
    if (!target.nodeId) continue;
    const node = nodeById.get(target.nodeId);
    if (!node) {
      issues.push({
        severity: 'warning',
        code: 'target_missing_node',
        message: `Цель производства: узел «${target.nodeId}» не найден`,
        context: { productId: target.nodeId },
      });
      continue;
    }
    if (isBufferNode(node)) {
      issues.push({
        severity: 'warning',
        code: 'target_on_buffer',
        message: `Цель на буфере ${nodeLabel(node)} игнорируется солвером — задайте цель на машине`,
        nodeId: node.id,
        context: machineContext(node),
      });
      continue;
    }
    if (!isFlowMachineNode(node)) continue;
    const recipe = recipeForNode(node, recipes);
    const targetKey = target.itemId ?? target.fluidId ?? '';
    if (!recipe || !targetKey) continue;
    if (!recipeOutputMatchesTarget(recipe, targetKey, tags)) {
      const isInput = recipe.inputs.some(
        (inp) => productKey(inp) === targetKey || flowsCompatible(inp, { itemId: targetKey, amount: 1 }, tags) || flowsCompatible(inp, { fluidId: targetKey, amount: 1 }, tags),
      );
      issues.push({
        severity: 'warning',
        code: 'target_not_output',
        message: `${nodeLabel(node)}: цель ${targetKey} не является выходом рецепта${isInput ? ' (это вход)' : ''}`,
        nodeId: node.id,
        context: {
          ...machineContext(node),
          productId: targetKey,
        },
      });
    }
  }
  return issues;
}

export interface CheckSchemeOptions {
  /** Reuse solver output for cycle-balance checks. */
  flowResult?: FlowResult;
}

export function checkScheme(
  scheme: TfgpFile,
  pack: PackData,
  options: CheckSchemeOptions = {},
): SchemeCheckResult {
  const nodeById = new Map(scheme.nodes.map((n) => [n.id, n]));
  const recipes = recipeMapFromPack(pack, scheme.nodes);
  const tags = buildTagIndex(pack);
  const issues: SchemeIssue[] = [];

  for (const edge of scheme.edges) {
    issues.push(...checkEdge(edge, nodeById, pack, recipes, tags));
  }
  issues.push(...checkDisconnectedInputs(scheme.nodes, scheme.edges, recipes));
  issues.push(...checkDisconnectedOutputs(scheme.nodes, scheme.edges, recipes, tags));
  issues.push(...checkOrphanStartBuffers(scheme.nodes, scheme.edges));
  issues.push(...checkTargets(scheme.targets ?? [], nodeById, recipes, tags));

  const hasStructuralErrors = issues.some((i) => i.severity === 'error');
  if (!hasStructuralErrors && options.flowResult) {
    issues.push(...checkCycleBalance(scheme, pack, options.flowResult, tags));
  }

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;

  return {
    ok: errorCount === 0,
    schemeName: scheme.meta.name,
    modpackVersion: scheme.modpack.version,
    issues,
    summary: {
      nodeCount: scheme.nodes.length,
      edgeCount: scheme.edges.length,
      machineCount: scheme.nodes.filter(isFlowMachineNode).length,
      errorCount,
      warningCount,
    },
  };
}

export function formatSchemeCheckReport(result: SchemeCheckResult): string {
  const lines: string[] = [
    `Схема: ${result.schemeName}`,
    `Modpack: ${result.modpackVersion}`,
    `Узлов: ${result.summary.nodeCount}, связей: ${result.summary.edgeCount}, машин: ${result.summary.machineCount}`,
    '',
  ];

  if (result.issues.length === 0) {
    lines.push('OK — замечаний нет');
    return lines.join('\n');
  }

  const groups: { severity: SchemeIssueSeverity; title: string }[] = [
    { severity: 'error', title: 'Ошибки' },
    { severity: 'warning', title: 'Предупреждения' },
    { severity: 'info', title: 'Информация' },
  ];

  for (const { severity, title } of groups) {
    const group = result.issues.filter((i) => i.severity === severity);
    if (group.length === 0) continue;
    lines.push(`${title} (${group.length}):`);
    for (const issue of group) {
      const ref = [issue.edgeId, issue.nodeId].filter(Boolean).join(', ');
      lines.push(`  • [${issue.code}] ${issue.message}${ref ? ` (${ref})` : ''}`);
    }
    lines.push('');
  }

  lines.push(result.ok ? 'Структура OK, есть предупреждения' : 'Есть ошибки — расчёт потоков может быть некорректен');
  return lines.join('\n');
}
