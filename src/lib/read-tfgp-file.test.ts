import { describe, expect, it } from 'vitest';
import { isTfgpDropFile, pickTfgpFile } from './read-tfgp-file';

describe('isTfgpDropFile', () => {
  it('accepts .tfgp by extension', () => {
    expect(isTfgpDropFile(new File(['{}'], 'line.tfgp'))).toBe(true);
    expect(isTfgpDropFile(new File(['{}'], 'line.TFGP'))).toBe(true);
  });

  it('accepts json mime types', () => {
    expect(
      isTfgpDropFile(new File(['{}'], 'data.json', { type: 'application/json' })),
    ).toBe(true);
  });

  it('rejects unrelated files', () => {
    expect(isTfgpDropFile(new File([''], 'notes.txt'))).toBe(false);
  });
});

describe('pickTfgpFile', () => {
  it('returns first supported file', () => {
    const files = [
      new File(['{}'], 'notes.txt'),
      new File(['{}'], 'scheme.tfgp'),
    ];
    const list = {
      length: files.length,
      item: (i: number) => files[i] ?? null,
      [Symbol.iterator]: () => files[Symbol.iterator](),
    } as FileList;

    expect(pickTfgpFile(list)?.name).toBe('scheme.tfgp');
  });
});
