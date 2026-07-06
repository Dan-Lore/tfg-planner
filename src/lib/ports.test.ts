import { describe, expect, it } from 'vitest';
import { normalizePortId, parsePortId } from '@/lib/ports';

describe('parsePortId', () => {
  it('parses canonical in/out ids', () => {
    expect(parsePortId('in_0')).toEqual({ kind: 'in', index: 0 });
    expect(parsePortId('out_2')).toEqual({ kind: 'out', index: 2 });
  });

  it('normalizes legacy input_* and output_* ids', () => {
    expect(parsePortId('input_0')).toEqual({ kind: 'in', index: 0 });
    expect(parsePortId('output_1')).toEqual({ kind: 'out', index: 1 });
  });

  it('returns null for invalid ids', () => {
    expect(parsePortId('bad')).toBeNull();
    expect(parsePortId('in_x')).toBeNull();
  });
});

describe('normalizePortId', () => {
  it('maps legacy prefixes', () => {
    expect(normalizePortId('input_3')).toBe('in_3');
    expect(normalizePortId('output_0')).toBe('out_0');
    expect(normalizePortId('in_1')).toBe('in_1');
  });
});
