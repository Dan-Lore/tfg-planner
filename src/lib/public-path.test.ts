import { describe, it, expect } from 'vitest';
import { publicPath } from './public-path';

describe('publicPath', () => {
  it('prefixes absolute public paths with BASE_URL', () => {
    expect(publicPath('/data/packs/manifest.json')).toBe(
      `${import.meta.env.BASE_URL}data/packs/manifest.json`,
    );
  });

  it('leaves http URLs unchanged', () => {
    expect(publicPath('https://example.com/x.json')).toBe('https://example.com/x.json');
  });
});
