import { describe, expect, it } from 'vitest';
import { shouldApplyFlowResult } from '@/lib/flow-compute-guard';
import { parsePositiveRate } from '@/lib/parse-positive-rate';

describe('shouldApplyFlowResult', () => {
  it('accepts matching revisions', () => {
    expect(shouldApplyFlowResult('abc', 'abc')).toBe(true);
  });

  it('rejects stale revisions after scheme edit', () => {
    expect(shouldApplyFlowResult('before', 'after')).toBe(false);
  });
});

describe('parsePositiveRate', () => {
  it('parses positive numbers', () => {
    expect(parsePositiveRate('2.5')).toBe(2.5);
  });

  it('rejects NaN and non-positive values', () => {
    expect(parsePositiveRate('abc')).toBeNull();
    expect(parsePositiveRate('0')).toBeNull();
    expect(parsePositiveRate('-1')).toBeNull();
    expect(parsePositiveRate('')).toBeNull();
  });
});
