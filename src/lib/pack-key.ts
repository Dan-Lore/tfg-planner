export function packKey(modpackVersion: string, dataVersion: number): string {
  return `${modpackVersion}@${dataVersion}`;
}
