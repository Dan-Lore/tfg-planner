import type { PackLike } from '@/data/pack-registry';
import type { Flow } from '@/data/types';
import type { Rational } from '@/calculator';
import { R } from '@/calculator';
import { formatRate } from '@/calculator';
import { inputPortId, outputPortId, productKey } from '@/shared/ports';
import { flowLabel } from '@/shared/flow-label';
import type { PortDisplay, PortLoadMeta } from '@/editor-graph/port-display-types';

export function formatLoadPercentDisplay(percent: number): string {
  if (percent >= 99.95) return '100%';
  if (percent <= 0.05) return '0%';
  return `${Math.round(percent)}%`;
}

export function buildPortDisplays(
  recipe:
    | {
        inputs: Flow[];
        outputs: Flow[];
      }
    | undefined,
  pack: PackLike,
  lang: 'ru' | 'en',
  connectedIn: Set<string>,
  connectedOut: Set<string>,
  inputRates: Record<string, string>,
  outputRates: Record<string, string>,
  outputPortRateRationals?: Record<string, Rational>,
  inputPortLoadMeta?: Record<string, PortLoadMeta>,
  outputPortLoadMeta?: Record<string, PortLoadMeta>,
): { inputPorts: PortDisplay[]; outputPorts: PortDisplay[] } {
  if (!recipe) {
    return { inputPorts: [], outputPorts: [] };
  }
  return {
    inputPorts: recipe.inputs.map((flow, i) => {
      const portId = inputPortId(i);
      const key = productKey(flow);
      const label = flowLabel(flow, pack, lang, flow.amount);
      const rate = inputRates[key];
      const loadMeta = inputPortLoadMeta?.[portId];
      return {
        portId,
        label,
        tooltip: [rate ? `${label} · ${rate}` : label, loadMeta?.title]
          .filter(Boolean)
          .join('\n'),
        rate,
        loadPercent: loadMeta?.loadPercent,
        loadLabel: loadMeta
          ? formatLoadPercentDisplay(loadMeta.loadPercent)
          : undefined,
        connected: connectedIn.has(portId),
      };
    }),
    outputPorts: recipe.outputs.map((flow, i) => {
      const portId = outputPortId(i);
      const key = productKey(flow);
      const label = flowLabel(flow, pack, lang, flow.amount);
      const portRate = outputPortRateRationals?.[portId];
      const loadMeta = outputPortLoadMeta?.[portId];
      const rate =
        portRate && portRate.compare(R.zero) > 0
          ? `${formatRate(portRate)}/s`
          : outputRates[key];
      return {
        portId,
        label,
        tooltip: [rate ? `${label} · ${rate}` : label, loadMeta?.title]
          .filter(Boolean)
          .join('\n'),
        rate,
        loadPercent: loadMeta?.loadPercent,
        loadLabel: loadMeta
          ? formatLoadPercentDisplay(loadMeta.loadPercent)
          : undefined,
        connected: connectedOut.has(portId),
      };
    }),
  };
}
