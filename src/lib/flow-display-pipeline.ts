import type { TFunction } from 'i18next';
import type { FlowResult } from '@/calculator/flow-solver';
import type { FlowEdgeData } from '@/lib/flow-edge-types';
import { buildEdgeFlowData } from '@/canvas/flow-display';
import type { ActivePack } from '@/data/pack-runtime';
import type { TfgpFile } from '@/schema/tfgp-types';export type FlowDisplayLocale = 'ru' | 'en';

export function buildFlowDisplayPipeline(
  scheme: TfgpFile,
  pack: ActivePack,
  result: FlowResult,
  _locale: FlowDisplayLocale,
  _t: TFunction,
  nodeWidths: Record<string, number>,
): Record<string, FlowEdgeData> {
  return buildEdgeFlowData(
    scheme.edges,
    scheme.nodes,
    pack,
    result,
    nodeWidths,
  );
}
