import { describe, expect, it } from 'vitest';
import { idsEqual } from '@/lib/id-array-equal';

describe('idsEqual', () => {
  it('compares as sets regardless of order', () => {
    expect(idsEqual(['a', 'b'], ['b', 'a'])).toBe(true);
  });

  it('returns false when lengths differ', () => {
    expect(idsEqual(['a'], ['a', 'b'])).toBe(false);
  });

  it('returns true for two empty arrays', () => {
    expect(idsEqual([], [])).toBe(true);
  });
});
