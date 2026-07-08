import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { parsePackLangArtifactBytes } from './lang-cache';

describe('parsePackLangArtifactBytes', () => {
  it('parses raw gzip bytes', async () => {
    const raw = readFileSync('public/data/packs/0.12.8/pack.lang.json.gz');
    const artifact = await parsePackLangArtifactBytes<{ format: string }>(raw.buffer.slice(
      raw.byteOffset,
      raw.byteOffset + raw.byteLength,
    ));
    expect(artifact.format).toBe('tfg-pack-lang');
  });

  it('parses already-decompressed JSON bytes', async () => {
    const json = gunzipSync(readFileSync('public/data/packs/0.12.8/pack.lang.json.gz'));
    const artifact = await parsePackLangArtifactBytes<{ format: string }>(
      json.buffer.slice(json.byteOffset, json.byteOffset + json.byteLength),
    );
    expect(artifact.format).toBe('tfg-pack-lang');
  });
});
