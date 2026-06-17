import { parse } from '@babel/parser';
import type { File } from '@babel/types';

export function parseKubeJs(source: string, filePath: string): File | null {
  try {
    return parse(source, {
      sourceType: 'module',
      sourceFilename: filePath,
      allowReturnOutsideFunction: true,
      plugins: ['typescript'],
    });
  } catch {
    return null;
  }
}
