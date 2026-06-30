import { normalizeNodeScaling } from '@/lib/node-scaling';
import { tfgpFilenameFromSchemeName } from '@/lib/tfgp-filename';
import type { VoltageTier } from '@/data/types';

export interface TfgpMeta {
  name: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  description: string;
}

export type TfgpNodeKind =
  | 'machine'
  | 'start_buffer'
  | 'intermediate_buffer'
  | 'end_buffer';

export type TfgpBufferKind = Exclude<TfgpNodeKind, 'machine'>;

export type TfgpSupplyMode = 'rate' | 'stock';

export interface TfgpNodeBase {
  id: string;
  position: { x: number; y: number };
  label?: string;
  kind?: TfgpNodeKind;
}

export interface TfgpMachineNode extends TfgpNodeBase {
  kind?: 'machine';
  machineId: string;
  recipeId: string;
  voltageTier: VoltageTier;
  overclock: number;
  parallel: number;
  machineCount: number;
  /** Multiblock: number of energy hatches (≥ ceil(recipe amperage)). */
  energyHatchCount?: number;
}

export interface TfgpBufferNodeBase extends TfgpNodeBase {
  itemId?: string;
  fluidId?: string;
  /** Storage capacity in items/mB; set once at creation. */
  capacity: number;
}

export interface TfgpStartBufferNode extends TfgpBufferNodeBase {
  kind: 'start_buffer';
  supplyMode: TfgpSupplyMode;
  /** Items/s when supplyMode is rate. */
  supplyRate?: number;
  /** Total items when supplyMode is stock. */
  initialStock?: number;
  /** When true, supplyRate tracks downstream demand each solve. */
  autoSupplyRate?: boolean;
}

export interface TfgpIntermediateBufferNode extends TfgpBufferNodeBase {
  kind: 'intermediate_buffer';
}

export interface TfgpEndBufferNode extends TfgpBufferNodeBase {
  kind: 'end_buffer';
}

export type TfgpNode =
  | TfgpMachineNode
  | TfgpStartBufferNode
  | TfgpIntermediateBufferNode
  | TfgpEndBufferNode;

export interface TfgpEdge {
  id: string;
  source: string;
  sourcePort: string;
  target: string;
  targetPort: string;
  itemId?: string;
  fluidId?: string;
}

export interface TfgpGroup {
  id: string;
  name: string;
  nodeIds: string[];
}

export interface TfgpTarget {
  nodeId?: string;
  itemId?: string;
  fluidId?: string;
  ratePerSecond: number;
}

export interface TfgpFile {
  format: 'tfg-planner-graph';
  formatVersion: 1;
  meta: TfgpMeta;
  modpack: { version: string; dataVersion: number };
  viewport: { x: number; y: number; zoom: number };
  nodes: TfgpNode[];
  edges: TfgpEdge[];
  groups: TfgpGroup[];
  targets: TfgpTarget[];
}

export function createEmptyTfgp(
  modpackVersion: string,
  dataVersion: number,
): TfgpFile {
  const now = new Date().toISOString();
  return {
    format: 'tfg-planner-graph',
    formatVersion: 1,
    meta: {
      name: 'Untitled',
      author: '',
      createdAt: now,
      updatedAt: now,
      description: '',
    },
    modpack: { version: modpackVersion, dataVersion },
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [],
    edges: [],
    groups: [],
    targets: [],
  };
}

export function parseTfgp(json: string): TfgpFile {
  const data = JSON.parse(json) as TfgpFile;
  if (data.format !== 'tfg-planner-graph' || data.formatVersion !== 1) {
    throw new Error('Unsupported .tfgp format');
  }
  return {
    ...data,
    nodes: data.nodes.map(normalizeNodeScaling),
  };
}

export function serializeTfgp(file: TfgpFile): string {
  return JSON.stringify(
    { ...file, meta: { ...file.meta, updatedAt: new Date().toISOString() } },
    null,
    2,
  );
}

export function downloadTfgp(file: TfgpFile, filename?: string): void {
  const blob = new Blob([serializeTfgp(file)], {
    type: 'application/vnd.tfg-planner.graph+json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? tfgpFilenameFromSchemeName(file.meta.name);
  a.click();
  URL.revokeObjectURL(url);
}
