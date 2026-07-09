import type { FlowResult } from '@/calculator/flow-solver';
import type { PackData } from '@/data/types';
import { buildTagIndex } from '@/shared/tag-index';
import { isFlowMachineNode } from '@/shared/node-kind';
import type { PackLike } from '@/data/pack-registry';
import type { TfgpEdge, TfgpFile, TfgpNode } from '@/schema/tfgp';
import {
  formatSchemeIssueSummary,
  type SchemeIssueTranslator,
} from '@/scheme-check/format-scheme-issue';
import { checkCycleBalance } from '@/scheme-check/check-scheme-cycles';
import {
  checkDisconnectedInputs,
  checkDisconnectedOutputs,
  checkEdge,
  checkOrphanStartBuffers,
  recipeMapFromPack,
} from '@/scheme-check/check-scheme-structural';

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
  | 'cycle_product_deficit'
  | 'cycle_product_surplus'
  | 'cycle_not_running'
  | 'cycle_no_seed'
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
  reproductionPercent?: string;
  bufferMaintainAmount?: string;
  sccIndex?: string;
  nodeIds?: string;
  balanceRatio?: string;
}

export interface SchemeIssue {
  severity: SchemeIssueSeverity;
  code: SchemeIssueCode;
  message?: string;
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

const CYCLE_OPERATIONAL_ISSUE_CODES = new Set<SchemeIssueCode>([
  'cycle_product_deficit',
  'cycle_product_surplus',
  'cycle_not_running',
]);

export function isCycleOperationalIssueCode(code: SchemeIssueCode): boolean {
  return CYCLE_OPERATIONAL_ISSUE_CODES.has(code);
}

/** Layout/wiring edge issues block flow animation; cycle balance warnings do not. */
export function edgeIssueBlocksFlowAnimation(
  edgeId: string,
  result: SchemeCheckResult | null,
): boolean {
  if (!result) return false;
  const issues = indexSchemeIssues(result).byEdgeId.get(edgeId) ?? [];
  return issues.some(
    (i) => i.severity !== 'info' && !isCycleOperationalIssueCode(i.code),
  );
}

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

export interface SchemeCheckReportOptions {
  pack?: PackLike | null;
  nodes?: TfgpNode[];
  edges?: TfgpEdge[];
  lang?: 'ru' | 'en';
  translate?: SchemeIssueTranslator;
}

function issueMessage(
  issue: SchemeIssue,
  options: SchemeCheckReportOptions,
): string {
  if (options.nodes && options.edges && options.translate) {
    return formatSchemeIssueSummary(
      issue,
      options.pack ?? null,
      options.lang ?? 'ru',
      options.nodes,
      options.edges,
      options.translate,
    );
  }
  return issue.message ?? issue.code;
}

export function formatSchemeCheckReport(
  result: SchemeCheckResult,
  options: SchemeCheckReportOptions = {},
): string {
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
      const message = issueMessage(issue, options);
      lines.push(`  • [${issue.code}] ${message}${ref ? ` (${ref})` : ''}`);
    }
    lines.push('');
  }

  lines.push(result.ok ? 'Структура OK, есть предупреждения' : 'Есть ошибки — расчёт потоков может быть некорректен');
  return lines.join('\n');
}
