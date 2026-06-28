import type { PackData, Recipe } from '@/data/types';
import { nodePortFlow, parsePortId, portsMatch, productKey } from '@/canvas/ports';
import { buildTagIndex } from '@/lib/tag-index';
import { isBufferNode, isMachineNode } from '@/lib/node-kind';
import { runSolver, normalizeSchemeNodes } from '@/stores/editor-utils';
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
  | 'stalled_machine'
  | 'target_on_buffer'
  | 'target_missing_node'
  | 'pack_version_missing'
  | 'tag_input_unverified'
  | 'edge_source_product_mismatch';

export interface SchemeIssue {
  severity: SchemeIssueSeverity;
  code: SchemeIssueCode;
  message: string;
  edgeId?: string;
  nodeId?: string;
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

const STALL_LOAD_EPS = 1e-6;
const STALL_RATE_EPS = 1e-9;

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

function recipeForNode(node: TfgpNode, pack: PackData): Recipe | undefined {
  if (!isMachineNode(node)) return undefined;
  return pack.recipes.find((r) => r.id === node.recipeId);
}

function nodeLabel(node: TfgpNode): string {
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
    });
    return issues;
  }
  if (!tgt) {
    issues.push({
      severity: 'error',
      code: 'missing_node',
      message: `Связь ${edge.id}: приёмник «${edge.target}» не найден`,
      edgeId: edge.id,
    });
    return issues;
  }

  const srcRecipe = recipeForNode(src, pack);
  const tgtRecipe = recipeForNode(tgt, pack);

  if (isMachineNode(src) && !srcRecipe) {
    issues.push({
      severity: 'error',
      code: 'missing_recipe',
      message: `Узел ${nodeLabel(src)}: рецепт «${src.recipeId}» отсутствует в pack ${pack.modpackVersion}`,
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
    });
  }

  const srcFlow = nodePortFlow(src, edge.sourcePort, srcRecipe);
  const tgtFlow = nodePortFlow(tgt, edge.targetPort, tgtRecipe);

  if (isMachineNode(src) && srcRecipe && !isPortInRange(srcRecipe, edge.sourcePort)) {
    issues.push({
      severity: 'error',
      code: 'invalid_source_port',
      message: `${edgeLabel(edge)}: порт ${edge.sourcePort} не существует у рецепта (выходов: ${srcRecipe.outputs.length})`,
      edgeId: edge.id,
      nodeId: src.id,
    });
  } else if (isMachineNode(src) && srcRecipe && !srcFlow) {
    issues.push({
      severity: 'error',
      code: 'invalid_source_port',
      message: `${edgeLabel(edge)}: не удалось определить продукт на ${edge.sourcePort}`,
      edgeId: edge.id,
      nodeId: src.id,
    });
  }

  if (isMachineNode(tgt) && tgtRecipe && !isPortInRange(tgtRecipe, edge.targetPort)) {
    issues.push({
      severity: 'error',
      code: 'invalid_target_port',
      message: `${edgeLabel(edge)} → ${edge.targetPort}: порт не существует (входов: ${tgtRecipe.inputs.length}). Такая связь обнуляет выход апстрима в расчёте потоков`,
      edgeId: edge.id,
      nodeId: tgt.id,
    });
  } else if (isMachineNode(tgt) && tgtRecipe && !tgtFlow) {
    issues.push({
      severity: 'error',
      code: 'invalid_target_port',
      message: `${edgeLabel(edge)} → ${edge.targetPort}: не удалось определить продукт на входе`,
      edgeId: edge.id,
      nodeId: tgt.id,
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
      });
    }
  }

  if (srcFlow && tgtFlow && !portsMatch(srcFlow, tgtFlow, tags)) {
    const edgeKey = edge.itemId ?? edge.fluidId ?? '';
    const srcKey = productKey(srcFlow);
    const tgtKey = productKey(tgtFlow);

    if (edgeKey && srcKey !== edgeKey) {
      issues.push({
        severity: 'error',
        code: 'edge_source_product_mismatch',
        message: `${edgeLabel(edge)}: на ${edge.sourcePort} рецепт отдаёт «${srcKey}», а в связи указано «${edgeKey}»`,
        edgeId: edge.id,
        nodeId: src.id,
      });
    } else if (tgtKey.startsWith('#') && edgeKey === srcKey) {
      issues.push({
        severity: 'warning',
        code: 'tag_input_unverified',
        message: `${edgeLabel(edge)}: вход — тег ${tgtKey}; совместимость тега не верифицируется pack data`,
        edgeId: edge.id,
        nodeId: tgt.id,
      });
    } else {
      issues.push({
        severity: 'error',
        code: 'product_mismatch',
        message: `${edgeLabel(edge)}: несовместимые продукты — ${srcKey} → ${tgtKey} (${edge.sourcePort} → ${edge.targetPort})`,
        edgeId: edge.id,
      });
    }
  } else if (srcFlow) {
    const edgeKey = edge.itemId ?? edge.fluidId ?? '';
    const srcKey = productKey(srcFlow);
    if (edgeKey && srcKey !== edgeKey) {
      issues.push({
        severity: 'error',
        code: 'edge_source_product_mismatch',
        message: `${edgeLabel(edge)}: на ${edge.sourcePort} рецепт отдаёт «${srcKey}», а в связи указано «${edgeKey}»`,
        edgeId: edge.id,
        nodeId: src.id,
      });
    }
  }

  return issues;
}

function checkDisconnectedInputs(
  nodes: TfgpNode[],
  edges: TfgpEdge[],
  pack: PackData,
): SchemeIssue[] {
  const issues: SchemeIssue[] = [];
  const connectedIn = new Map<string, Set<string>>();

  for (const edge of edges) {
    if (!connectedIn.has(edge.target)) connectedIn.set(edge.target, new Set());
    connectedIn.get(edge.target)!.add(edge.targetPort);
  }

  for (const node of nodes) {
    if (!isMachineNode(node)) continue;
    const recipe = recipeForNode(node, pack);
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
      });
    }
  }

  return issues;
}

function checkTargets(
  targets: TfgpTarget[],
  nodeById: Map<string, TfgpNode>,
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
      });
      continue;
    }
    if (isBufferNode(node)) {
      issues.push({
        severity: 'warning',
        code: 'target_on_buffer',
        message: `Цель на буфере ${nodeLabel(node)} игнорируется солвером — задайте цель на машине`,
        nodeId: node.id,
      });
    }
  }
  return issues;
}

function checkStalledMachines(
  scheme: TfgpFile,
  pack: PackData,
): SchemeIssue[] {
  const issues: SchemeIssue[] = [];
  const nodes = normalizeSchemeNodes(scheme.nodes, pack);
  const result = runSolver(
    { nodes, edges: scheme.edges, targets: scheme.targets, viewport: scheme.viewport },
    pack,
    { preserveManualMachineCounts: true },
  );

  for (const node of nodes) {
    if (!isMachineNode(node)) continue;
    const recipe = recipeForNode(node, pack);
    if (!recipe || recipe.outputs.length === 0) continue;

    const theoretical = result.nodePortOutputRates[node.id]?.out_0;
    const effective = result.nodeEffectivePortOutputRates[node.id]?.out_0;
    const load = result.nodeLoad[node.id];

    if (!theoretical || theoretical.toNumber() <= STALL_RATE_EPS) continue;
    if (load && load.toNumber() > STALL_LOAD_EPS) continue;
    if (effective && effective.toNumber() > STALL_RATE_EPS) continue;

    issues.push({
      severity: 'warning',
      code: 'stalled_machine',
      message: `${nodeLabel(node)}: теоретический выход ${theoretical.toNumber().toFixed(4)}/s, но эффективная нагрузка 0% — проверьте входы и исходящие связи`,
      nodeId: node.id,
    });
  }

  return issues;
}

export function checkScheme(scheme: TfgpFile, pack: PackData): SchemeCheckResult {
  const nodeById = new Map(scheme.nodes.map((n) => [n.id, n]));
  const tags = buildTagIndex(pack);
  const issues: SchemeIssue[] = [];

  for (const edge of scheme.edges) {
    issues.push(...checkEdge(edge, nodeById, pack, tags));
  }
  issues.push(...checkDisconnectedInputs(scheme.nodes, scheme.edges, pack));
  issues.push(...checkTargets(scheme.targets ?? [], nodeById));

  const hasStructuralErrors = issues.some((i) => i.severity === 'error');
  if (!hasStructuralErrors) {
    issues.push(...checkStalledMachines(scheme, pack));
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
      machineCount: scheme.nodes.filter(isMachineNode).length,
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
