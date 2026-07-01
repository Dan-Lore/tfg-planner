import type { PackLike } from '@/data/pack-registry';
import { getItemName, getMachineName } from '@/data/pack-registry';
import type { TfgpEdge, TfgpNode } from '@/schema/tfgp';
import { isMachineNode } from '@/lib/node-kind';
import type { SchemeIssue, SchemeIssueCode } from '@/scheme-check/check-scheme';

export type SchemeIssueTranslator = (
  key: string,
  params?: Record<string, string>,
) => string;

function productDisplayName(
  pack: PackLike | null,
  lang: 'ru' | 'en',
  productId?: string,
): string {
  if (!productId) return '?';
  if (!pack) return productId;
  return getItemName(pack, productId, lang);
}

/** Human-readable name with raw id in parentheses when both differ. */
function labelWithId(displayName: string, id: string): string {
  if (!id) return '';
  if (!displayName || displayName === id) return id;
  return `${displayName} (${id})`;
}

function nodeById(nodes: TfgpNode[], nodeId?: string): TfgpNode | undefined {
  if (!nodeId) return undefined;
  return nodes.find((n) => n.id === nodeId);
}

function edgeById(edges: TfgpEdge[], edgeId?: string): TfgpEdge | undefined {
  if (!edgeId) return undefined;
  return edges.find((e) => e.id === edgeId);
}

function baseParams(
  issue: SchemeIssue,
  pack: PackLike | null,
  lang: 'ru' | 'en',
  nodes: TfgpNode[],
  edges: TfgpEdge[],
): Record<string, string> {
  const ctx = issue.context ?? {};
  const node = nodeById(nodes, issue.nodeId);
  const edge = edgeById(edges, issue.edgeId);
  const machineId =
    ctx.machineId ?? (node && isMachineNode(node) ? node.machineId : undefined);
  const recipeId =
    ctx.recipeId ?? (node && isMachineNode(node) ? node.recipeId : undefined);
  const machineName =
    machineId && pack ? getMachineName(pack, machineId, lang) : '';
  const productName = productDisplayName(pack, lang, ctx.productId);
  const srcProductName = productDisplayName(pack, lang, ctx.srcProductId);
  const tgtProductName = productDisplayName(pack, lang, ctx.tgtProductId);
  const edgeProductName = productDisplayName(pack, lang, ctx.edgeProductId);
  const source = edge?.source ?? '';
  const target = edge?.target ?? '';

  return {
    nodeId: issue.nodeId ?? '',
    edgeId: issue.edgeId ?? '',
    machineId: machineId ?? '',
    machineName,
    machineLabel: machineId ? labelWithId(machineName, machineId) : '',
    recipeId: recipeId ?? '',
    portId: ctx.portId ?? '',
    product: productName,
    productId: ctx.productId ?? '',
    productLabel: ctx.productId ? labelWithId(productName, ctx.productId) : '',
    srcProduct: srcProductName,
    srcProductId: ctx.srcProductId ?? '',
    srcProductLabel: ctx.srcProductId
      ? labelWithId(srcProductName, ctx.srcProductId)
      : '',
    tgtProduct: tgtProductName,
    tgtProductId: ctx.tgtProductId ?? '',
    tgtProductLabel: ctx.tgtProductId
      ? labelWithId(tgtProductName, ctx.tgtProductId)
      : '',
    edgeProduct: edgeProductName,
    edgeProductId: ctx.edgeProductId ?? '',
    edgeProductLabel: ctx.edgeProductId
      ? labelWithId(edgeProductName, ctx.edgeProductId)
      : '',
    outputCount: ctx.outputCount ?? '',
    inputCount: ctx.inputCount ?? '',
    theoreticalRate: ctx.theoreticalRate ?? '',
    source,
    target,
    edgeRoute: source && target ? `${source} → ${target}` : '',
  };
}

const SUMMARY_KEYS: Record<SchemeIssueCode, string> = {
  missing_node: 'editor.schemeCheck.issues.missing_node',
  missing_recipe: 'editor.schemeCheck.issues.missing_recipe',
  invalid_source_port: 'editor.schemeCheck.issues.invalid_source_port',
  invalid_target_port: 'editor.schemeCheck.issues.invalid_target_port',
  product_mismatch: 'editor.schemeCheck.issues.product_mismatch',
  buffer_port_direction: 'editor.schemeCheck.issues.buffer_port_direction',
  disconnected_input: 'editor.schemeCheck.issues.disconnected_input',
  stalled_machine: 'editor.schemeCheck.issues.stalled_machine',
  target_on_buffer: 'editor.schemeCheck.issues.target_on_buffer',
  target_missing_node: 'editor.schemeCheck.issues.target_missing_node',
  pack_version_missing: 'editor.schemeCheck.issues.pack_version_missing',
  tag_input_unverified: 'editor.schemeCheck.issues.tag_input_unverified',
  edge_source_product_mismatch: 'editor.schemeCheck.issues.edge_source_product_mismatch',
};

const REASON_KEYS: Record<SchemeIssueCode, string> = {
  missing_node: 'editor.schemeCheck.issues.missing_node_reason',
  missing_recipe: 'editor.schemeCheck.issues.missing_recipe_reason',
  invalid_source_port: 'editor.schemeCheck.issues.invalid_source_port_reason',
  invalid_target_port: 'editor.schemeCheck.issues.invalid_target_port_reason',
  product_mismatch: 'editor.schemeCheck.issues.product_mismatch_reason',
  buffer_port_direction: 'editor.schemeCheck.issues.buffer_port_direction_reason',
  disconnected_input: 'editor.schemeCheck.issues.disconnected_input_reason',
  stalled_machine: 'editor.schemeCheck.issues.stalled_machine_reason',
  target_on_buffer: 'editor.schemeCheck.issues.target_on_buffer_reason',
  target_missing_node: 'editor.schemeCheck.issues.target_missing_node_reason',
  pack_version_missing: 'editor.schemeCheck.issues.pack_version_missing_reason',
  tag_input_unverified: 'editor.schemeCheck.issues.tag_input_unverified_reason',
  edge_source_product_mismatch: 'editor.schemeCheck.issues.edge_source_product_mismatch_reason',
};

const DETAIL_KEYS: Partial<Record<SchemeIssueCode, string>> = {
  missing_node: 'editor.schemeCheck.issues.missing_node_detail',
  missing_recipe: 'editor.schemeCheck.issues.missing_recipe_detail',
  invalid_source_port: 'editor.schemeCheck.issues.invalid_source_port_detail',
  invalid_target_port: 'editor.schemeCheck.issues.invalid_target_port_detail',
  product_mismatch: 'editor.schemeCheck.issues.product_mismatch_detail',
  buffer_port_direction: 'editor.schemeCheck.issues.buffer_port_direction_detail',
  disconnected_input: 'editor.schemeCheck.issues.disconnected_input_detail',
  stalled_machine: 'editor.schemeCheck.issues.stalled_machine_detail',
  target_on_buffer: 'editor.schemeCheck.issues.target_on_buffer_detail',
  target_missing_node: 'editor.schemeCheck.issues.target_missing_node_detail',
  tag_input_unverified: 'editor.schemeCheck.issues.tag_input_unverified_detail',
  edge_source_product_mismatch: 'editor.schemeCheck.issues.edge_source_product_mismatch_detail',
  pack_version_missing: 'editor.schemeCheck.issues.pack_version_missing_detail',
};

export function formatSchemeIssueSummary(
  issue: SchemeIssue,
  pack: PackLike | null,
  lang: 'ru' | 'en',
  nodes: TfgpNode[],
  edges: TfgpEdge[],
  t: SchemeIssueTranslator,
): string {
  const key = SUMMARY_KEYS[issue.code];
  if (!key) return issue.message;
  const params = baseParams(issue, pack, lang, nodes, edges);
  const translated = t(key, params);
  return translated === key ? issue.message : translated;
}

export function formatSchemeIssueDetail(
  issue: SchemeIssue,
  pack: PackLike | null,
  lang: 'ru' | 'en',
  nodes: TfgpNode[],
  edges: TfgpEdge[],
  t: SchemeIssueTranslator,
): string {
  const params = baseParams(issue, pack, lang, nodes, edges);
  const parts: string[] = [];

  const reasonKey = REASON_KEYS[issue.code];
  if (reasonKey) {
    const reasonLabel = t('editor.schemeCheck.detailReason');
    const reason = t(reasonKey, params);
    if (reason !== reasonKey) {
      parts.push(`${reasonLabel}: ${reason}`);
    }
  }

  const detailKey = DETAIL_KEYS[issue.code];
  if (detailKey) {
    const detail = t(detailKey, params);
    if (detail !== detailKey) {
      if (parts.length > 0) parts.push('');
      parts.push(detail);
    }
  }

  return parts.length > 0 ? parts.join('\n') : issue.message;
}
