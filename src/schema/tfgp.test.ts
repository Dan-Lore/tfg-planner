import { describe, expect, it } from 'vitest';
import { createEmptyTfgp, parseTfgp, serializeTfgp } from '@/schema/tfgp';

describe('parseTfgp', () => {
  it('round-trips a minimal scheme', () => {
    const file = createEmptyTfgp('0.12.8', 1);
    const parsed = parseTfgp(serializeTfgp(file));
    expect(parsed.format).toBe('tfg-planner-graph');
    expect(parsed.nodes).toEqual([]);
    expect(parsed.edges).toEqual([]);
  });

  it('rejects unsupported format', () => {
    expect(() => parseTfgp(JSON.stringify({ format: 'other', formatVersion: 1 }))).toThrow(
      /Unsupported/,
    );
  });

  it('rejects missing nodes array', () => {
    const raw = JSON.stringify({
      format: 'tfg-planner-graph',
      formatVersion: 1,
      meta: { name: 'x', author: '', createdAt: '', updatedAt: '', description: '' },
      modpack: { version: '0.12.8', dataVersion: 1 },
      viewport: { x: 0, y: 0, zoom: 1 },
      edges: [],
      groups: [],
      targets: [],
    });
    expect(() => parseTfgp(raw)).toThrow(/nodes must be an array/);
  });

  it('rejects malformed JSON', () => {
    expect(() => parseTfgp('{not json')).toThrow();
  });

  it('rejects edges without sourcePort and targetPort', () => {
    const raw = JSON.stringify({
      format: 'tfg-planner-graph',
      formatVersion: 1,
      meta: { name: 'x', author: '', createdAt: '', updatedAt: '', description: '' },
      modpack: { version: '0.12.8', dataVersion: 1 },
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [],
      edges: [{ id: 'e1', source: 'a', target: 'b' }],
      groups: [],
      targets: [],
    });
    expect(() => parseTfgp(raw)).toThrow(/sourcePort must be a non-empty string/);
  });
});
