import type { FlowOp, RecipeOp } from '../../../types.js';
import { parseAmountPrefix } from '../flow-parse.js';

const GREENHOUSE_BASE_DURATION = 10 * 60 * 20;
const GREENHOUSE_DURATION_FERTILIZED = 0.75;
const GREENHOUSE_DURATION_AQUAPONICS = 0.5;

/** GT chance weights (10000 = guaranteed); match recipes.greenhouse.js defaults. */
export const GREENHOUSE_CHANCE_BASE = 750;
export const GREENHOUSE_CHANCE_FERTILIZED = 4000;
export const GREENHOUSE_CHANCE_AQUAPONIC = 8000;

interface DimMods {
  id: string;
  fluid: string;
  fluidTier2: string | null;
  fertilizer: string | null;
  canFertilize: boolean;
}

const DIMENSION_INDEX: DimMods[] = [
  {
    id: 'minecraft:overworld',
    fluid: '#tfg:clean_water',
    fluidTier2: 'tfg:nitrate_rich_water',
    fertilizer: 'gtceu:fertilizer',
    canFertilize: true,
  },
  {
    id: 'minecraft:the_nether',
    fluid: '#tfg:clean_water',
    fluidTier2: 'tfg:nitrate_rich_water',
    fertilizer: 'gtceu:fertilizer',
    canFertilize: true,
  },
  {
    id: 'ad_astra:moon',
    fluid: 'gtceu:helium_3',
    fluidTier2: null,
    fertilizer: null,
    canFertilize: false,
  },
  {
    id: 'ad_astra:mars',
    fluid: 'tfg:semiheavy_ammoniacal_water',
    fluidTier2: 'tfg:nitrate_rich_semiheavy_ammoniacal_water',
    fertilizer: 'gtceu:fertilizer',
    canFertilize: true,
  },
];

export function linuxUnfucker(s: string): string {
  return s
    .trim()
    .replace(/^(\d+x\s+)?/i, '')
    .replace(/^gtceu:/, '')
    .replace(/\//g, '_')
    .replace(/:/g, '_');
}

function parseItemFlow(s: string): FlowOp {
  const { amount, id } = parseAmountPrefix(s.trim());
  return { itemId: id, amount };
}

function parseOutputList(outputs: string[]): FlowOp[] {
  const flows: FlowOp[] = [];
  flows.push(parseItemFlow(outputs[0]));
  for (let i = 1; i < 4; i++) {
    const src = outputs[i] ?? outputs[outputs.length - 1];
    flows.push(parseItemFlow(src));
  }
  return flows;
}

function withChancedOutputs(base: FlowOp[], chance: number): FlowOp[] {
  return base.map((flow, i) => (i >= 1 && i <= 3 ? { ...flow, chance } : flow));
}

function dimModsFor(dimension: string | null): {
  fertilizer: string | null;
  canFertilize: boolean;
} {
  const dim = dimension ? DIMENSION_INDEX.find((d) => d.id === dimension) : null;
  return {
    fertilizer: dim ? dim.fertilizer : 'gtceu:fertilizer',
    canFertilize: dim ? dim.canFertilize : true,
  };
}

function circuitSuffix(circuit: number | null): string {
  return circuit === null || circuit === undefined ? '' : `/${circuit}`;
}

export interface GreenhouseCall {
  dimension: string | null;
  input: string;
  outputs: string[];
  circuit: number | null;
  chanceMultiplier?: number;
}

function scaledChances(multiplier: number): {
  base: number;
  fertilized: number;
  aquaponic: number;
  hydroBase: number;
  hydroFertilized: number;
  hydroAquaponic: number;
} {
  const m = Math.max(1, Math.round(multiplier * 100));
  const clamp = (v: number) => Math.min(10_000, Math.max(1, Math.round(v)));
  return {
    base: clamp(7.5 * m),
    fertilized: clamp(40 * m),
    aquaponic: clamp(80 * m),
    hydroBase: clamp(7.5 * m),
    hydroFertilized: clamp(40 * m * 1.25),
    hydroAquaponic: clamp(80 * m * 1.25),
  };
}

export function expandGreenhouseCall(call: GreenhouseCall, source: string): RecipeOp[] {
  const { dimension, input, outputs, circuit } = call;
  const mods = dimModsFor(dimension);
  const inputFlow = parseItemFlow(input);
  const chances = scaledChances(call.chanceMultiplier ?? 1);
  const outputFlows = parseOutputList(outputs);
  const baseId = linuxUnfucker(input);
  const cSuffix = circuitSuffix(circuit);
  const baseDuration = GREENHOUSE_BASE_DURATION;
  const fertDuration = Math.max(1, Math.round(baseDuration * GREENHOUSE_DURATION_FERTILIZED));
  const aquaDuration = Math.max(1, Math.round(baseDuration * GREENHOUSE_DURATION_AQUAPONICS));

  const recipes: RecipeOp[] = [];

  const makeRecipe = (
    id: string,
    machineId: string,
    duration: number,
    chancedOutputs: FlowOp[],
    extraInputs: FlowOp[] = [],
    extraOutputs: FlowOp[] = [],
  ): RecipeOp => ({
    id,
    machineId,
    inputs: [inputFlow, ...extraInputs],
    outputs: [...chancedOutputs, ...extraOutputs],
    durationTicks: duration,
    source,
  });

  if (mods.canFertilize) {
    recipes.push(
      makeRecipe(
        `tfg:${baseId}${cSuffix}`,
        'gtceu:greenhouse',
        baseDuration,
        withChancedOutputs(outputFlows, chances.base),
      ),
      makeRecipe(
        `tfg:${baseId}_fertilized${cSuffix}`,
        'gtceu:greenhouse',
        fertDuration,
        withChancedOutputs(outputFlows, chances.fertilized),
        [{ itemId: mods.fertilizer!, amount: 8 }],
      ),
      makeRecipe(
        `tfg:${baseId}_aquaponic${cSuffix}`,
        'gtceu:greenhouse',
        aquaDuration,
        withChancedOutputs(outputFlows, chances.aquaponic),
        [],
        [{ itemId: 'tfg:flora_pellets', amount: 1 }],
      ),
      makeRecipe(
        `tfg:${baseId}${cSuffix}@hydroponics`,
        'gtceu:hydroponics_facility',
        baseDuration,
        withChancedOutputs(outputFlows, chances.hydroBase),
      ),
      makeRecipe(
        `tfg:${baseId}_fertilized${cSuffix}@hydroponics`,
        'gtceu:hydroponics_facility',
        fertDuration,
        withChancedOutputs(outputFlows, chances.hydroFertilized),
        [{ itemId: mods.fertilizer!, amount: 8 }],
      ),
      makeRecipe(
        `tfg:${baseId}_aquaponic${cSuffix}@hydroponics`,
        'gtceu:hydroponics_facility',
        aquaDuration,
        withChancedOutputs(outputFlows, chances.hydroAquaponic),
        [],
        [{ itemId: 'tfg:flora_pellets', amount: 1 }],
      ),
    );
  } else {
    recipes.push(
      makeRecipe(
        `tfg:${baseId}${cSuffix}`,
        'gtceu:greenhouse',
        fertDuration,
        withChancedOutputs(outputFlows, chances.fertilized),
      ),
      makeRecipe(
        `tfg:${baseId}${cSuffix}@hydroponics`,
        'gtceu:hydroponics_facility',
        fertDuration,
        withChancedOutputs(outputFlows, chances.hydroFertilized),
      ),
    );
  }

  return recipes;
}

export function expandCropGreenhouseCall(
  dimension: string | null,
  input: string,
  output: string,
  leaves: string | null,
  source: string,
): RecipeOp[] {
  const calls: GreenhouseCall[] = [
    {
      dimension,
      input: `4x ${input}`,
      outputs: [`20x ${output}`, `1x ${input}`, `4x ${output}`],
      circuit: 1,
    },
    {
      dimension,
      input: `4x ${input}`,
      outputs: [`20x ${output}`, `8x ${input}`, `4x ${input}`],
      circuit: 5,
    },
  ];
  if (leaves) {
    calls.push({
      dimension,
      input: `4x ${input}`,
      outputs: [`20x ${output}`, `16x ${leaves}`, `8x ${leaves}`],
      circuit: 10,
    });
  }
  return calls.flatMap((c) => expandGreenhouseCall(c, source));
}

export function expandTreeGreenhouseCall(
  dimension: string | null,
  input: string,
  output: string,
  leaves: string | null,
  source: string,
): RecipeOp[] {
  const calls: GreenhouseCall[] = [
    {
      dimension,
      input: `8x ${input}`,
      outputs: [`64x ${output}`, `4x ${input}`, `16x ${output}`],
      circuit: 1,
    },
    {
      dimension,
      input: `8x ${input}`,
      outputs: [`64x ${output}`, `16x ${input}`, `8x ${input}`],
      circuit: 5,
    },
  ];
  if (leaves) {
    calls.push({
      dimension,
      input: `8x ${input}`,
      outputs: [`64x ${output}`, `32x ${leaves}`, `16x ${leaves}`],
      circuit: 10,
    });
  }
  return calls.flatMap((c) => expandGreenhouseCall(c, source));
}
