export interface TfgpMeta {
  name: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  description: string;
}

export interface TfgpNode {
  id: string;
  machineId: string;
  recipeId: string;
  position: { x: number; y: number };
  overclock: number;
  parallel: number;
  machineCount: number;
  outputMultiplier: number;
  label?: string;
}

export interface TfgpEdge {
  id: string;
  source: string;
  sourcePort: string;
  target: string;
  targetPort: string;
  itemId?: string;
  fluidId?: string;
}

export interface TfgpGroup {
  id: string;
  name: string;
  nodeIds: string[];
}

export interface TfgpTarget {
  nodeId?: string;
  itemId?: string;
  fluidId?: string;
  ratePerSecond: number;
}

export interface TfgpFile {
  format: 'tfg-planner-graph';
  formatVersion: 1;
  meta: TfgpMeta;
  modpack: { version: string; dataVersion: number };
  viewport: { x: number; y: number; zoom: number };
  nodes: TfgpNode[];
  edges: TfgpEdge[];
  groups: TfgpGroup[];
  targets: TfgpTarget[];
}

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
  const data = JSON.parse(json) as TfgpFile;
  if (data.format !== 'tfg-planner-graph' || data.formatVersion !== 1) {
    throw new Error('Unsupported .tfgp format');
  }
  return data;
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
  a.download = filename ?? `${file.meta.name || 'scheme'}.tfgp`;
  a.click();
  URL.revokeObjectURL(url);
}
