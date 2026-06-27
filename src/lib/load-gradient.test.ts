import { describe, expect, it } from 'vitest';
import { loadGradientHue } from './load-gradient';

describe('loadGradientHue', () => {
  it('maps 0% to red and 100% to green', () => {
    expect(loadGradientHue(0)).toBeCloseTo(0, 5);
    expect(loadGradientHue(100)).toBeCloseTo(120, 5);
  });

  it('passes through orange and yellow mid-range', () => {
    expect(loadGradientHue(17)).toBeGreaterThan(10);
    expect(loadGradientHue(17)).toBeLessThan(25);
    expect(loadGradientHue(50)).toBeGreaterThan(40);
    expect(loadGradientHue(50)).toBeLessThan(60);
  });
});
