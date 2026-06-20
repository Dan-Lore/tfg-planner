import { describe, expect, it } from 'vitest';
import { formatRecipeDuration } from '@/lib/recipe-duration';

describe('formatRecipeDuration', () => {
  it('formats seconds', () => {
    expect(formatRecipeDuration(100, 'ru')).toBe('5 с');
    expect(formatRecipeDuration(100, 'en')).toBe('5s');
  });

  it('formats minutes', () => {
    expect(formatRecipeDuration(12000, 'ru')).toBe('10 мин');
    expect(formatRecipeDuration(12000, 'en')).toBe('10m');
  });

  it('formats sub-second as ticks', () => {
    expect(formatRecipeDuration(10, 'ru')).toBe('10 тик');
    expect(formatRecipeDuration(10, 'en')).toBe('10 t');
  });
});
