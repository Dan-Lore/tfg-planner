import type { FlowResult } from '@/calculator/flow-solver';
import type { PackData } from '@/data/types';
import type { TfgpFile } from '@/schema/tfgp';
import { checkScheme, type SchemeCheckResult } from '@/scheme-check/check-scheme';

export function runSchemeCheck(
  scheme: TfgpFile,
  pack: PackData,
  flowResult?: FlowResult | null,
): SchemeCheckResult {
  return checkScheme(scheme, pack, flowResult ? { flowResult } : {});
}
