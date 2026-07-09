import type { PackData } from '@/data/types';
import type { VoltageTier } from '@/calculator/gt-voltage';
import type { Rational } from '@/calculator/rational';
import type { SchemeGraphEdge } from '@/shared/scheme-edge-types';

export const TICKS_PER_SECOND = 20;

export type SchemeNodeKind =
  | 'machine'
  | 'custom_machine'
  | 'start_buffer'
  | 'intermediate_buffer'
  | 'end_buffer';

export interface SchemeCustomPort {
  itemId?: string;
  fluidId?: string;
  amount: number;
}

export interface SchemeNode {
  id: string;
  kind?: SchemeNodeKind;
  machineId: string;
  recipeId: string;
  machineCount: number;
  overclock: number;
  primaryOutputIndex?: number;
  voltageTier: VoltageTier;
  itemId?: string;
  fluidId?: string;
  capacity?: number;
  supplyMode?: 'rate' | 'stock';
  supplyRate?: number;
  initialStock?: number;
  autoSupplyRate?: boolean;
  durationTicks?: number;
  customInputs?: SchemeCustomPort[];
  customOutputs?: SchemeCustomPort[];
}

export type SchemeEdge = SchemeGraphEdge;

export interface SchemeEdgeConstraint {
  edgeId: string;
  ratePerSecond: number;
}

export interface CycleSeedInfo {
  edgeId: string;
  sccIndex: number;
  seedFlowPerSecond: number;
  /** Theoretical catalyst demand on the seed port (not limited by buffer stock). */
  theoreticalDemandPerSecond: number;
  productId: string;
  netPerSecond: number;
  producePerSecond: number;
  consumePerSecond: number;
  reproductionPercent?: number;
  bufferMaintainAmount?: number;
  /** Catalyst production attempts per second (expected / chance). */
  produceAttemptPerSecond?: number;
  /** Catalyst consumption attempts per second (expected / chance). */
  consumeAttemptPerSecond?: number;
  /** GT chance on consumer port (e.g. 1000 = 10%). */
  catalystChance?: number;
  /** Minimum recommended intermediate-buffer stock for a 1 h planning horizon. */
  recommendedCapacity: number;
  recommendedCapacityDetail?: {
    attemptsPerHour: number;
    chancePercent: number;
    mean: number;
    stdDev: number;
    zScore: number;
  };
  mode: 'deficit' | 'stable' | 'surplus';
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
  cycleSeeds?: CycleSeedInfo[];
}

export interface SolverInput {
  nodes: SchemeNode[];
  edges: SchemeEdge[];
  edgeConstraints?: SchemeEdgeConstraint[];
  pack: PackData;
  preserveManualMachineCounts?: boolean;
}

export const CONVERGENCE_EPS = 1e-9;
export const MAX_FLOW_ITERATIONS = 50;
