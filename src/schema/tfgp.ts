import { normalizeNodeScaling } from '@/lib/node-scaling';
import { tfgpFilenameFromSchemeName } from '@/lib/tfgp-filename';
import { assertTfgpShape } from '@/schema/tfgp-validate';

export type {
  TfgpBufferKind,
  TfgpEdge,
  TfgpEndBufferNode,
  TfgpFile,
  TfgpGroup,
  TfgpIntermediateBufferNode,
  TfgpMachineNode,
  TfgpMeta,
  TfgpNode,
  TfgpNodeBase,
  TfgpNodeKind,
  TfgpStartBufferNode,
  TfgpSupplyMode,
  TfgpTarget,
} from '@/schema/tfgp-types';

import type { TfgpFile } from '@/schema/tfgp-types';

export function createEmptyTfgp(
  modpackVersion: string,
  dataVersion: number,
): TfgpFile {
  const now = new Date().toISOString();
  return {
    format: 'tfg-planner-graph',
    formatVersion: 1,
    meta: {
      name: 'Untitled',
      author: '',
      createdAt: now,
      updatedAt: now,
      description: '',
    },
    modpack: { version: modpackVersion, dataVersion },
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [],
    edges: [],
    groups: [],
    targets: [],
  };
}

export function parseTfgp(json: string): TfgpFile {
  const data = JSON.parse(json) as unknown;
  assertTfgpShape(data);
  return {
    ...data,
    nodes: data.nodes.map(normalizeNodeScaling),
  };
}

export function serializeTfgp(file: TfgpFile): string {
  return JSON.stringify(
    { ...file, meta: { ...file.meta, updatedAt: new Date().toISOString() } },
    null,
    2,
  );
}

export function downloadTfgp(file: TfgpFile, filename?: string): void {
  const blob = new Blob([serializeTfgp(file)], {
    type: 'application/vnd.tfg-planner.graph+json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? tfgpFilenameFromSchemeName(file.meta.name);
  a.click();
  URL.revokeObjectURL(url);
}
