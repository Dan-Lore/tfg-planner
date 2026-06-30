import { parseTfgp, type TfgpFile } from '@/schema/tfgp';
import { schemeNameFromFilename } from '@/lib/tfgp-filename';

export function isTfgpDropFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.tfgp')) return true;
  if (file.type === 'application/json') return true;
  if (file.type === 'application/vnd.tfg-planner.graph+json') return true;
  return false;
}

export function pickTfgpFile(fileList: FileList): File | null {
  for (const file of fileList) {
    if (isTfgpDropFile(file)) return file;
  }
  return null;
}

export function readTfgpFile(file: File): Promise<TfgpFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseTfgp(reader.result as string);
        const nameFromFile = schemeNameFromFilename(file.name);
        resolve({
          ...parsed,
          meta: { ...parsed.meta, name: nameFromFile },
        });
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Import failed'));
      }
    };
    reader.onerror = () => reject(new Error('Read failed'));
    reader.readAsText(file);
  });
}
