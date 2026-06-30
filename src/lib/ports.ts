export function productKey(flow: { itemId?: string; fluidId?: string }): string {
  return flow.itemId ?? flow.fluidId ?? '';
}

export function flowKey(flow: { itemId?: string; fluidId?: string }): string {
  if (flow.fluidId) return `fluid:${flow.fluidId}`;
  return `item:${flow.itemId ?? ''}`;
}

export function normalizePortId(port: string): string {
  return port.replace(/^output_/, 'out_').replace(/^input_/, 'in_');
}

export function inputPortId(index: number): string {
  return `in_${index}`;
}

export function outputPortId(index: number): string {
  return `out_${index}`;
}

export function parsePortId(port: string): { kind: 'in' | 'out'; index: number } | null {
  const m = port.match(/^(in|out)_(\d+)$/);
  if (!m) return null;
  return { kind: m[1] as 'in' | 'out', index: Number(m[2]) };
}
