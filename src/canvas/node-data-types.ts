import type { PackLike } from '@/data/pack-registry';
import type { VoltageTier } from '@/calculator';
import type { TfgpBufferKind, TfgpCustomPort, TfgpSupplyMode } from '@/schema/tfgp';
import type { NodeBalanceLine, PortDisplay } from '@/editor-graph/port-display-types';

export type { PortDisplay };

export interface MachineNodeData {
  machineId: string;
  recipeId: string;
  machineCount: number;
  overclock: number;
  voltageTier: VoltageTier;
  pack: PackLike;
  inputPorts?: PortDisplay[];
  outputPorts?: PortDisplay[];
  balanceLines?: NodeBalanceLine[];
  loadPercent?: number;
  loadLabel?: string;
  loadTitle?: string;
  inputPortIds?: string[];
  outputPortIds?: string[];
  checkSeverity?: 'error' | 'warning';
  checkTitle?: string;
  layoutWidth?: number;
  [key: string]: unknown;
}

export interface BufferNodeData {
  bufferKind: TfgpBufferKind;
  itemId?: string;
  fluidId?: string;
  capacity: number;
  supplyMode?: TfgpSupplyMode;
  supplyRate?: number;
  initialStock?: number;
  autoSupplyRate?: boolean;
  pack: PackLike;
  checkSeverity?: 'error' | 'warning';
  checkTitle?: string;
  inputPorts: PortDisplay[];
  outputPorts: PortDisplay[];
  loadPercent?: number;
  loadLabel?: string;
  loadTitle?: string;
  inputPortIds?: string[];
  outputPortIds?: string[];
  [key: string]: unknown;
}

export interface CustomMachineNodeData {
  label?: string;
  durationTicks: number;
  machineCount: number;
  overclock: number;
  inputs: TfgpCustomPort[];
  outputs: TfgpCustomPort[];
  pack: PackLike;
  inputPorts?: PortDisplay[];
  outputPorts?: PortDisplay[];
  balanceLines?: NodeBalanceLine[];
  loadPercent?: number;
  loadLabel?: string;
  loadTitle?: string;
  inputPortIds?: string[];
  outputPortIds?: string[];
  checkSeverity?: 'error' | 'warning';
  checkTitle?: string;
  layoutWidth?: number;
  [key: string]: unknown;
}
