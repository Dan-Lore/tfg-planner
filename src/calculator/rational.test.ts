import { describe, expect, it } from 'vitest';
import { R, Rational } from '@/calculator/rational';

describe('Rational', () => {
  it('adds and compares exactly', () => {
    expect(R.from(0.1).add(R.from(0.2)).compare(R.from(0.3))).toBe(0);
  });

  it('rejects non-finite input', () => {
    expect(() => R.from(Number.NaN)).toThrow(/Invalid number/);
  });

  it('stringifies fractions', () => {
    expect(new Rational(1n, 2n).toString()).toBe('1/2');
  });
});
