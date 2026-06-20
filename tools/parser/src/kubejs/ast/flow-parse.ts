import type { FlowOp } from '../../types.js';

const COUNT_PREFIX = /^(\d+)x\s+/i;

export function parseAmountPrefix(s: string): { amount: number; id: string } {
  const m = s.match(COUNT_PREFIX);
  if (m) {
    return { amount: Number(m[1]), id: s.slice(m[0].length).trim() };
  }
  return { amount: 1, id: s.trim() };
}

export function fluidStringToFlow(s: string): FlowOp | undefined {
  const trimmed = s.trim();
  const space = trimmed.lastIndexOf(' ');
  if (space <= 0) return undefined;
  const id = trimmed.slice(0, space).trim();
  const amount = Number(trimmed.slice(space + 1));
  if (!id || Number.isNaN(amount)) return undefined;
  return { fluidId: id, amount };
}

export function itemStringToFlow(s: string): FlowOp {
  const { amount, id } = parseAmountPrefix(s);
  return { itemId: id, amount };
}

export function sanitizeFlow(flow: FlowOp): FlowOp {
  const chance = flow.chance;
  if (flow.itemId) {
    const { amount, id } = parseAmountPrefix(flow.itemId);
    const out: FlowOp = { itemId: id, amount: flow.amount * amount };
    if (chance !== undefined) out.chance = chance;
    return out;
  }
  if (flow.fluidId) {
    const trimmed = flow.fluidId.trim();
    const m = trimmed.match(COUNT_PREFIX);
    if (m) {
      const out: FlowOp = {
        fluidId: trimmed.slice(m[0].length).trim(),
        amount: flow.amount * Number(m[1]),
      };
      if (chance !== undefined) out.chance = chance;
      return out;
    }
  }
  return flow;
}
