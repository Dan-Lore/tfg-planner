export interface PackBuildManifest {
  modpackVersion: string;
  dataVersion: number;
  checksum: string;
  generatedAt: string;
  langPath?: string;
  langSha256?: string;
  langBytes?: number;
}
