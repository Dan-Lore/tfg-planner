import type { TfgpFile } from '@/schema/tfgp-types';
import { isNonEmptyString, isRecord } from '@/lib/tfgp-shape-guards';

export type { TfgpFile } from '@/schema/tfgp-types';

function assertTfgpEdge(edge: unknown, index: number): void {
  if (!isRecord(edge)) {
    throw new Error(`Invalid .tfgp: edges[${index}] must be an object`);
  }
  if (!isNonEmptyString(edge.id)) {
    throw new Error(`Invalid .tfgp: edges[${index}].id must be a non-empty string`);
  }
  if (!isNonEmptyString(edge.source)) {
    throw new Error(`Invalid .tfgp: edges[${index}].source must be a non-empty string`);
  }
  if (!isNonEmptyString(edge.target)) {
    throw new Error(`Invalid .tfgp: edges[${index}].target must be a non-empty string`);
  }
  if (!isNonEmptyString(edge.sourcePort)) {
    throw new Error(
      `Invalid .tfgp: edges[${index}].sourcePort must be a non-empty string`,
    );
  }
  if (!isNonEmptyString(edge.targetPort)) {
    throw new Error(
      `Invalid .tfgp: edges[${index}].targetPort must be a non-empty string`,
    );
  }
  if (edge.itemId !== undefined && typeof edge.itemId !== 'string') {
    throw new Error(`Invalid .tfgp: edges[${index}].itemId must be a string when present`);
  }
  if (edge.fluidId !== undefined && typeof edge.fluidId !== 'string') {
    throw new Error(`Invalid .tfgp: edges[${index}].fluidId must be a string when present`);
  }
}

/** Validate parsed JSON shape before normalizing nodes. */
export function assertTfgpShape(data: unknown): asserts data is TfgpFile {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Invalid .tfgp: root must be an object');
  }
  const root = data as Record<string, unknown>;
  if (root.format !== 'tfg-planner-graph' || root.formatVersion !== 1) {
    throw new Error('Unsupported .tfgp format');
  }
  if (root.meta === null || typeof root.meta !== 'object' || Array.isArray(root.meta)) {
    throw new Error('Invalid .tfgp: meta must be an object');
  }
  if (typeof (root.meta as Record<string, unknown>).name !== 'string') {
    throw new Error('Invalid .tfgp: meta.name must be a string');
  }
  if (root.modpack === null || typeof root.modpack !== 'object' || Array.isArray(root.modpack)) {
    throw new Error('Invalid .tfgp: modpack must be an object');
  }
  const modpack = root.modpack as Record<string, unknown>;
  if (typeof modpack.version !== 'string') {
    throw new Error('Invalid .tfgp: modpack.version must be a string');
  }
  if (typeof modpack.dataVersion !== 'number') {
    throw new Error('Invalid .tfgp: modpack.dataVersion must be a number');
  }
  if (root.viewport === null || typeof root.viewport !== 'object' || Array.isArray(root.viewport)) {
    throw new Error('Invalid .tfgp: viewport must be an object');
  }
  if (!Array.isArray(root.nodes)) {
    throw new Error('Invalid .tfgp: nodes must be an array');
  }
  if (!Array.isArray(root.edges)) {
    throw new Error('Invalid .tfgp: edges must be an array');
  }
  root.edges.forEach((edge, index) => assertTfgpEdge(edge, index));
  if (!Array.isArray(root.groups)) {
    throw new Error('Invalid .tfgp: groups must be an array');
  }
  if (!Array.isArray(root.targets)) {
    throw new Error('Invalid .tfgp: targets must be an array');
  }
}

export const TFGP_MAX_BYTES = 32 * 1024 * 1024;
