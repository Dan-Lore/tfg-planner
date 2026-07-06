import type { VoltageTier } from '@/data/types';
import type { SchemeGraphEdge } from '@/lib/scheme-edge-types';

export interface TfgpMeta {
  name: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  description: string;
}

export type TfgpNodeKind =
  | 'machine'
  | 'custom_machine'
  | 'start_buffer'
  | 'intermediate_buffer'
  | 'end_buffer';

export type TfgpBufferKind = Exclude<TfgpNodeKind, 'machine' | 'custom_machine'>;

export interface TfgpCustomPort {
  /** User-defined port name when no pack product is set. */
  label?: string;
  itemId?: string;
  fluidId?: string;
  amount: number;
}

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
  machineCount: number;
  /** Output port index (0-based) used for backward machine-count pass; default 0. */
  primaryOutputIndex?: number;
  energyHatchCount?: number;
}

export interface TfgpBufferNodeBase extends TfgpNodeBase {
  itemId?: string;
  fluidId?: string;
  capacity: number;
}

export interface TfgpStartBufferNode extends TfgpBufferNodeBase {
  kind: 'start_buffer';
  supplyMode: TfgpSupplyMode;
  supplyRate?: number;
  initialStock?: number;
  autoSupplyRate?: boolean;
}

export interface TfgpIntermediateBufferNode extends TfgpBufferNodeBase {
  kind: 'intermediate_buffer';
}

export interface TfgpEndBufferNode extends TfgpBufferNodeBase {
  kind: 'end_buffer';
}

export interface TfgpCustomMachineNode extends TfgpNodeBase {
  kind: 'custom_machine';
  durationTicks: number;
  machineCount: number;
  overclock: number;
  primaryOutputIndex?: number;
  inputs: TfgpCustomPort[];
  outputs: TfgpCustomPort[];
}

export type TfgpNode =
  | TfgpMachineNode
  | TfgpCustomMachineNode
  | TfgpStartBufferNode
  | TfgpIntermediateBufferNode
  | TfgpEndBufferNode;

export type TfgpEdge = SchemeGraphEdge;

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

export interface TfgpEdgeConstraint {
  edgeId: string;
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
  edgeConstraints?: TfgpEdgeConstraint[];
}
