import type { PackLike } from '@/data/pack-registry';
import type { VoltageTier } from '@/calculator';

export interface PortDisplay {
  portId: string;
  label: string;
  tooltip?: string;
  rate?: string;
  loadPercent?: number;
  loadLabel?: string;
  connected: boolean;
}

export interface PortLoadMeta {
  loadPercent: number;
  title: string;
}

export interface NodeBalanceLine {
  kind: 'in' | 'out';
  text: string;
}

/** Minimal machine node fields for layout width estimation. */
export interface MachineLayoutData {
  machineId: string;
  recipeId: string;
  machineCount: number;
  overclock: number;
  voltageTier: VoltageTier;
  pack: PackLike;
  inputPorts?: PortDisplay[];
  outputPorts?: PortDisplay[];
  balanceLines?: NodeBalanceLine[];
}
