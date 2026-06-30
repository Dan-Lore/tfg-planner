import { describe, expect, it } from 'vitest';
import { schemeNameFromFilename, tfgpFilenameFromSchemeName } from './tfgp-filename';

describe('schemeNameFromFilename', () => {
  it('strips .tfgp extension case-insensitively', () => {
    expect(schemeNameFromFilename('copper-line.tfgp')).toBe('copper-line');
    expect(schemeNameFromFilename('copper-line.TFGP')).toBe('copper-line');
  });

  it('replaces invalid filename characters', () => {
    expect(schemeNameFromFilename('bad:name?.tfgp')).toBe('bad_name_');
  });

  it('falls back to Untitled for empty stem', () => {
    expect(schemeNameFromFilename('.tfgp')).toBe('Untitled');
    expect(schemeNameFromFilename('   .tfgp')).toBe('Untitled');
  });
});

describe('tfgpFilenameFromSchemeName', () => {
  it('appends .tfgp and sanitizes', () => {
    expect(tfgpFilenameFromSchemeName('Медная линия')).toBe('Медная линия.tfgp');
    expect(tfgpFilenameFromSchemeName('a/b')).toBe('a_b.tfgp');
  });

  it('falls back to scheme.tfgp for empty name', () => {
    expect(tfgpFilenameFromSchemeName('   ')).toBe('scheme.tfgp');
  });
});
