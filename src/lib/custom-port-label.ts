import { flowLabel } from '@/canvas/ports';
import type { PortDisplay } from '@/canvas/MachineNode';
import type { PackLike } from '@/data/pack-registry';
import { normalizePortId } from '@/lib/ports';
import type { TfgpCustomPort, TfgpEdge } from '@/schema/tfgp';

/** Display name for a custom_machine port (user label, product, edge, or fallback). */
export function resolveCustomPortLabel(
  port: TfgpCustomPort | undefined,
  portId: string,
  edges: readonly TfgpEdge[],
  nodeId: string,
  pack: PackLike,
  lang: 'ru' | 'en',
  direction: 'in' | 'out',
  emptyFallback: string,
): string {
  const custom = port?.label?.trim();
  if (custom) return custom;

  if (port?.itemId || port?.fluidId) {
    return flowLabel(
      { itemId: port.itemId, fluidId: port.fluidId, amount: 1 },
      pack,
      lang,
    );
  }

  for (const edge of edges) {
    const isMatch =
      direction === 'in'
        ? edge.target === nodeId && normalizePortId(edge.targetPort) === portId
        : edge.source === nodeId && normalizePortId(edge.sourcePort) === portId;
    if (!isMatch) continue;
    const productId = edge.itemId ?? edge.fluidId;
    if (!productId) continue;
    return flowLabel(
      { itemId: edge.itemId, fluidId: edge.fluidId, amount: 1 },
      pack,
      lang,
    );
  }

  return emptyFallback;
}

export function applyCustomPortLabels(
  displays: PortDisplay[],
  portDefs: TfgpCustomPort[],
  edges: readonly TfgpEdge[],
  nodeId: string,
  pack: PackLike,
  lang: 'ru' | 'en',
  direction: 'in' | 'out',
  emptyFallback: string,
): void {
  for (let i = 0; i < displays.length; i++) {
    const display = displays[i]!;
    const def = portDefs[i];
    const label = resolveCustomPortLabel(
      def,
      display.portId,
      edges,
      nodeId,
      pack,
      lang,
      direction,
      emptyFallback,
    );
    const rate = display.rate;
    const loadTitle =
      display.tooltip && display.tooltip.includes('\n')
        ? display.tooltip.split('\n').slice(1).join('\n')
        : undefined;
    display.label = label;
    display.tooltip = [rate ? `${label} · ${rate}` : label, loadTitle]
      .filter(Boolean)
      .join('\n');
  }
}
