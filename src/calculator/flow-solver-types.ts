import type { PackData } from '@/data/types';
import type { VoltageTier } from '@/calculator/gt-voltage';
import type { Rational } from '@/calculator/rational';
import type { SchemeGraphEdge } from '@/lib/scheme-edge-types';

export const TICKS_PER_SECOND = 20;

export type SchemeNodeKind =
  | 'machine'
  | 'start_buffer'
  | 'intermediate_buffer'
  | 'end_buffer';

export interface SchemeNode {
  id: string;
  kind?: SchemeNodeKind;
  machineId: string;
  recipeId: string;
  machineCount: number;
  overclock: number;
  parallel: number;
  primaryOutputIndex?: number;
  voltageTier: VoltageTier;
  itemId?: string;
  fluidId?: string;
  capacity?: number;
  supplyMode?: 'rate' | 'stock';
  supplyRate?: number;
  initialStock?: number;
  autoSupplyRate?: boolean;
}

export type SchemeEdge = SchemeGraphEdge;

export interface SchemeTarget {
  nodeId: string;
  itemId?: string;
  fluidId?: string;
  ratePerSecond: number;
}

export interface FlowResult {
  edgeFlows: Record<string, Rational>;
  edgeTargetFlows: Record<string, Rational>;
  nodeOutputRates: Record<string, Record<string, Rational>>;
  nodePortOutputRates: Record<string, Record<string, Rational>>;
  nodeInputRates: Record<string, Record<string, Rational>>;
  nodePortDeficit: Record<string, Record<string, Rational>>;
  nodePortInLoad: Record<string, Record<string, Rational>>;
  nodePortOutRecipeLoad: Record<string, Record<string, Rational>>;
  nodePortOutConsumerLoad: Record<string, Record<string, Rational>>;
  nodePortDownstreamDemand: Record<string, Record<string, Rational>>;
  nodeInputLimitedPortOutputRates: Record<string, Record<string, Rational>>;
  nodeEffectivePortOutputRates: Record<string, Record<string, Rational>>;
  nodePortOutCapacityLoad: Record<string, Record<string, Rational>>;
  /** @deprecated Use nodePortOutRecipeLoad */
  nodePortOutLoad: Record<string, Record<string, Rational>>;
  nodeMaxLoad: Record<string, Rational>;
  nodeCurrentLoad: Record<string, Rational>;
  /** @deprecated Use nodeCurrentLoad */
  nodeLoad: Record<string, Rational>;
  nodeSurplus: Record<string, Record<string, Rational>>;
  nodeMachineCounts: Record<string, number>;
  /** True when iterative flow convergence did not reach epsilon within max iterations. */
  nonConverged?: boolean;
}

export interface SolverInput {
  nodes: SchemeNode[];
  edges: SchemeEdge[];
  targets: SchemeTarget[];
  pack: PackData;
  preserveManualMachineCounts?: boolean;
}

export const CONVERGENCE_EPS = 1e-9;
export const MAX_FLOW_ITERATIONS = 50;
