import { describe, expect, it } from 'vitest';
import { clampMachineCount } from '@/lib/machine-count';

describe('clampMachineCount', () => {
  it.each([
    { value: 0, expected: 0 },
    { value: 1, expected: 1 },
    { value: 3.7, expected: 4 },
    { value: -2, expected: 0 },
    { value: Number.NaN, expected: 0 },
  ])('clampMachineCount($value) → $expected', ({ value, expected }) => {
    expect(clampMachineCount(value)).toBe(expected);
  });
});
